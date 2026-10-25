import { analyze } from './analyzer';
import type { Analysis, AnalysisOptions } from './analyzer';
import { evaluarReto } from './challenge';
import type { Challenge, ChallengeResult } from './challenge';
import type { ErrorInfo } from './errors';
import { Machine, serialize } from './runtime/machine';
import type { MachineEvent, MachineOptions, MachineStatus, SerializedValue, Snapshot } from './runtime/machine';
import { compile } from './runtime/compiler';
import { parse } from './syntax/parser';
import type { ParseEvent } from './syntax/parser';
import type * as ast from './syntax/ast';
import type { Token } from './syntax/token';
import { createWorld } from './world';
import type { WorldDefinition } from './world';

/**
 * Protocolo del sandbox: los mensajes entre la página y el worker que ejecuta el código. La lógica vive aquí,
 * sin depender de `postMessage`, para poder probarla; `worker.ts` la conecta con el worker y `sandbox.ts` es
 * el cliente tipado para la página.
 */

/** Qué eventos llegan en cada tanda. */
export type EventDetail = 'nada' | 'pasos' | 'decisiones' | 'todo';

export interface SandboxOptions {
  /** Entrada inicial, además de la que se dé con `entrada`. */
  input?: string[];
  /** Si `leer()` sin entrada pausa la ejecución para pedirla. Por defecto `true`. */
  interactiveInput?: boolean;
  /** Semilla de `aleatorio`. Si no se da, se elige una al cargar y se conserva en los retrocesos. */
  seed?: number;
  maxOperations?: number;
  maxCallDepth?: number;
  maxOutput?: number;
  breakpoints?: number[];
  /** Mundo del modo mundo, en el formato de `WorldDefinition`. */
  world?: WorldDefinition;
  /**
   * `pasos`: solo `paso` y `robot`; `decisiones`: además `decide`; `todo`: todos los eventos; `nada`: ninguno.
   * Por defecto `decisiones`.
   */
  detail?: EventDetail;
  /** Operaciones por tanda antes de ceder el control. Por defecto 50 000. */
  batchSize?: number;
  /** Si `cargado` trae `parseTrace`: cómo construyó el parser el árbol, paso a paso. Por defecto `false`. */
  parseTrace?: boolean;
}

export type SandboxRequest =
  | { type: 'cargar'; id: number; source: string; options?: SandboxOptions }
  /** Analiza sin ejecutar (ver `analyze`). Se atiende aunque haya una ejecución en curso y no la afecta. */
  | { type: 'analizar'; id: number; source: string; options?: AnalysisOptions }
  /** Ejecuta hasta terminar, sin detenerse en los puntos de interrupción. */
  | { type: 'ejecutar'; id: number }
  /** Ejecuta hasta el siguiente punto de interrupción, o hasta terminar. */
  | { type: 'continuar'; id: number }
  | { type: 'paso'; id: number }
  | { type: 'pausar'; id: number }
  /** Vuelve a ejecutar desde el inicio, con la misma entrada y semilla, hasta el paso `step`. */
  | { type: 'ir_a_paso'; id: number; step: number }
  | { type: 'entrada'; id: number; line: string }
  | { type: 'cerrar_entrada'; id: number }
  | { type: 'puntos_de_interrupción'; id: number; lines: number[] }
  | { type: 'evaluar_reto'; id: number; source: string; challenge: Challenge };

export type StopReason = 'paso' | 'punto_de_interrupción' | 'pausa' | 'entrada' | 'fin' | 'error' | 'retroceso';

export interface Loaded {
  type: 'cargado';
  id: number;
  tokens: Token[];
  program: ast.Program;
  /** Errores léxicos y sintácticos. Si hay alguno, no se puede ejecutar. */
  errors: ErrorInfo[];
  /** Semilla de `aleatorio` de esta carga. */
  seed: number;
  /** La traza del parser (ver `parse(código, { trace: true })`), solo con la opción `parseTrace`. */
  parseTrace?: ParseEvent[];
}

export interface Progress {
  type: 'progreso';
  id: number;
  operations: number;
  steps: number;
  /** Salida nueva desde el mensaje anterior. */
  output: string;
  events: MachineEvent[];
}

export interface Stopped {
  type: 'detenido';
  id: number;
  status: MachineStatus;
  reason: StopReason;
  operations: number;
  steps: number;
  /** Salida nueva desde el mensaje anterior; con `replaceOutput`, toda la salida. */
  output: string;
  /** En un retroceso, la salida reemplaza a la anterior en lugar de agregarse. */
  replaceOutput?: boolean;
  events: MachineEvent[];
  snapshot: Snapshot;
  result?: SerializedValue;
  error?: ErrorInfo;
}

/** Respuesta de `analizar`: tokens, AST, errores, diagnósticos, símbolos y diagrama de flujo. */
export interface Analyzed extends Analysis {
  type: 'análisis';
  id: number;
}

export type SandboxResponse =
  | Loaded
  | Analyzed
  | Progress
  | Stopped
  | { type: 'hecho'; id: number }
  | { type: 'reto'; id: number; result: ChallengeResult }
  /** El mensaje no se pudo atender (no hay programa cargado, la ejecución sigue en curso…). */
  | { type: 'error'; id: number; message: string };

const DETAIL: Record<EventDetail, ReadonlySet<MachineEvent['type']> | 'todo'> = {
  nada: new Set(),
  pasos: new Set(['paso', 'robot']),
  decisiones: new Set(['paso', 'robot', 'decide']),
  todo: 'todo',
};

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));

export class SandboxHost {
  private program?: ast.Program;
  private options: SandboxOptions = {};
  private seed = 0;
  private machine?: Machine;
  /** Líneas que se le dieron a `leer()` en esta carga, para repetirlas al retroceder. */
  private inputLog: string[] = [];
  private inputClosed = false;
  private events: MachineEvent[] = [];
  private muted = false;
  private sentOutput = 0;
  private running = false;
  private pauseRequested = false;

  constructor(private readonly post: (message: SandboxResponse) => void) {}

  async handle(request: SandboxRequest): Promise<void> {
    switch (request.type) {
      case 'cargar':
        if (this.running) return this.busy(request.id);
        return this.load(request.id, request.source, request.options ?? {});
      case 'analizar':
        this.post({ type: 'análisis', id: request.id, ...analyze(request.source, request.options) });
        return;
      case 'evaluar_reto':
        this.post({ type: 'reto', id: request.id, result: evaluarReto(request.source, request.challenge) });
        return;
      case 'pausar':
        this.pauseRequested = this.running;
        this.post({ type: 'hecho', id: request.id });
        return;
    }

    const machine = this.machine;
    if (!machine) {
      this.post({ type: 'error', id: request.id, message: 'No hay un programa cargado sin errores.' });
      return;
    }
    switch (request.type) {
      case 'entrada':
        this.inputLog.push(request.line);
        machine.provideInput(request.line);
        this.post({ type: 'hecho', id: request.id });
        return;
      case 'cerrar_entrada':
        this.inputClosed = true;
        machine.closeInput();
        this.post({ type: 'hecho', id: request.id });
        return;
      case 'puntos_de_interrupción':
        this.options = { ...this.options, breakpoints: request.lines };
        machine.setBreakpoints(request.lines);
        this.post({ type: 'hecho', id: request.id });
        return;
    }

    if (this.running) return this.busy(request.id);
    switch (request.type) {
      case 'paso':
        machine.step();
        this.stopped(request.id, machine);
        return;
      case 'ejecutar':
      case 'continuar':
        return this.runInBatches(request.id, machine, request.type === 'ejecutar');
      case 'ir_a_paso':
        this.goToStep(request.id, request.step);
        return;
    }
  }

  private busy(id: number): void {
    this.post({ type: 'error', id, message: 'La ejecución sigue en curso; pausa antes de mandar otra orden.' });
  }

  private load(id: number, source: string, options: SandboxOptions): void {
    this.options = options;
    this.seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
    this.inputLog = [];
    this.inputClosed = false;
    this.events = [];
    this.sentOutput = 0;
    const { program, tokens, errors, trace } = parse(source, { trace: options.parseTrace ?? false });
    this.program = errors.length === 0 ? program : undefined;
    this.machine = this.program ? this.createMachine() : undefined;
    this.post({
      type: 'cargado',
      id,
      tokens,
      program,
      errors: errors.map(error => error.toJSON()),
      seed: this.seed,
      ...(trace ? { parseTrace: trace } : {}),
    });
  }

  private createMachine(): Machine {
    const { options } = this;
    const levels = DETAIL[options.detail ?? 'decisiones'];
    const machineOptions: MachineOptions = {
      input: options.input ?? [],
      interactiveInput: options.interactiveInput ?? true,
      seed: this.seed,
      breakpoints: options.breakpoints ?? [],
      onEvent: event => {
        if (this.muted) return;
        if (levels === 'todo' || levels.has(event.type)) this.events.push(event);
      },
      ...(options.maxOperations !== undefined ? { maxOperations: options.maxOperations } : {}),
      ...(options.maxCallDepth !== undefined ? { maxCallDepth: options.maxCallDepth } : {}),
      ...(options.maxOutput !== undefined ? { maxOutput: options.maxOutput } : {}),
      ...(options.world ? { world: createWorld(options.world) } : {}),
    };
    return new Machine(compile(this.program!), machineOptions);
  }

  private async runInBatches(id: number, machine: Machine, ignoreBreakpoints: boolean): Promise<void> {
    this.running = true;
    this.pauseRequested = false;
    const breakpoints = this.options.breakpoints ?? [];
    if (ignoreBreakpoints) machine.setBreakpoints([]);
    try {
      while (true) {
        const status = machine.run(this.options.batchSize ?? 50_000);
        if (status !== 'pausada' || machine.pauseReason !== 'presupuesto') break;
        if (this.pauseRequested) break;
        this.post({
          type: 'progreso',
          id,
          operations: machine.operations,
          steps: machine.steps,
          output: this.newOutput(machine),
          events: this.takeEvents(),
        });
        // Ceder el control deja que llegue un `pausar`.
        await tick();
        if (this.pauseRequested) break;
      }
    } finally {
      if (ignoreBreakpoints) machine.setBreakpoints(breakpoints);
      this.running = false;
    }
    this.stopped(id, machine, this.pauseRequested && machine.status === 'pausada' ? 'pausa' : undefined);
    this.pauseRequested = false;
  }

  private goToStep(id: number, step: number): void {
    // Como la ejecución es determinista, otra máquina con la misma entrada y semilla llega al mismo estado.
    const machine = this.createMachine();
    for (const line of this.inputLog) machine.provideInput(line);
    if (this.inputClosed) machine.closeInput();
    this.muted = true;
    try {
      while (machine.steps < step && !machine.done && machine.status !== 'esperando_entrada') machine.step();
    } finally {
      this.muted = false;
    }
    this.machine = machine;
    this.events = [];
    this.sentOutput = 0;
    this.stopped(id, machine, 'retroceso', true);
  }

  private newOutput(machine: Machine): string {
    const output = machine.output;
    const fresh = output.slice(this.sentOutput);
    this.sentOutput = output.length;
    return fresh;
  }

  private takeEvents(): MachineEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }

  private stopped(id: number, machine: Machine, reason?: StopReason, replaceOutput = false): void {
    const status = machine.status;
    const finalReason: StopReason =
      reason ??
      (status === 'terminada'
        ? 'fin'
        : status === 'error'
          ? 'error'
          : status === 'esperando_entrada'
            ? 'entrada'
            : machine.pauseReason === 'punto_de_interrupción'
              ? 'punto_de_interrupción'
              : 'paso');
    this.post({
      type: 'detenido',
      id,
      status,
      reason: finalReason,
      operations: machine.operations,
      steps: machine.steps,
      output: this.newOutput(machine),
      ...(replaceOutput ? { replaceOutput: true } : {}),
      events: this.takeEvents(),
      snapshot: machine.snapshot(),
      ...(status === 'terminada' ? { result: serialize(machine.result) } : {}),
      ...(machine.error ? { error: machine.error.toJSON() } : {}),
    });
  }
}
