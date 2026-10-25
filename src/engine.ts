import { analyzeProgram } from './analyzer';
import type { Diagnostic } from './analyzer';
import type { CodexivoError, ErrorInfo } from './errors';
import type * as ast from './syntax/ast';
import { parse } from './syntax/parser';
import type { Token } from './syntax/token';
import { compile } from './runtime/compiler';
import { Machine } from './runtime/machine';
import type { MachineEvent, MachineOptions, MachineStatus } from './runtime/machine';
import { repr, Scope } from './runtime/values';
import type { Value } from './runtime/values';
import type { WorldState } from './world';

export interface PreparedProgram {
  program: ast.Program;
  tokens: Token[];
  /** Errores léxicos y sintácticos. Si hay alguno, `machine` no existe. */
  errors: CodexivoError[];
  /** Lo que el análisis estático encontró (ver `analyze`). No impide ejecutar: la máquina da el mismo error al llegar. */
  diagnostics: Diagnostic[];
  machine?: Machine;
}

/** Analiza el código y, si no tiene errores, prepara una máquina lista para ejecutarlo paso a paso. */
export const prepare = (source: string, options: MachineOptions = {}): PreparedProgram => {
  const { program, tokens, errors } = parse(source);
  const { diagnostics } = analyzeProgram(program, {
    world: Boolean(options.world),
    natives: options.natives,
    globals: options.globals?.variables.keys(),
    allowRedeclare: options.allowRedeclare,
    incomplete: errors.length > 0,
  });
  if (errors.length > 0) return { program, tokens, errors, diagnostics };
  return { program, tokens, errors, diagnostics, machine: new Machine(compile(program), options) };
};

export interface RunOptions extends Omit<MachineOptions, 'onEvent'> {
  /** Guarda los eventos de la ejecución en `events`. */
  trace?: boolean;
  /** Máximo de eventos a guardar con `trace`. Por defecto 100 000. */
  maxEvents?: number;
}

export interface RunResult {
  status: MachineStatus;
  /** `true` si el programa terminó sin errores. */
  ok: boolean;
  /** Valor de la última expresión del programa, o lo que regresó con `regresa`. */
  result: Value;
  /** `result` como se escribiría en código. */
  resultText: string;
  output: string;
  errors: ErrorInfo[];
  operations: number;
  /** Semilla de `aleatorio` que usó la ejecución; pásala en `seed` para repetirla. */
  seed?: number;
  /** Estado final del mundo, si se ejecutó en modo mundo. */
  world?: WorldState;
  events?: MachineEvent[];
  /** `true` si se guardaron menos eventos de los que ocurrieron. */
  eventsTruncated?: boolean;
}

/** Ejecuta un programa completo. */
export const run = (source: string, options: RunOptions = {}): RunResult => {
  const { trace, maxEvents = 100_000, ...machineOptions } = options;
  const events: MachineEvent[] = [];
  let eventsTruncated = false;
  const onEvent = trace
    ? (event: MachineEvent) => {
        if (events.length < maxEvents) events.push(event);
        else eventsTruncated = true;
      }
    : undefined;

  const { errors, machine } = prepare(source, { ...machineOptions, onEvent });
  if (!machine) {
    return {
      status: 'error',
      ok: false,
      result: null,
      resultText: 'nulo',
      output: '',
      errors: errors.map(error => error.toJSON()),
      operations: 0,
      ...(trace ? { events, eventsTruncated } : {}),
    };
  }

  machine.run();
  return {
    status: machine.status,
    ok: machine.status === 'terminada',
    result: machine.result,
    resultText: repr(machine.result),
    output: machine.output,
    errors: machine.error ? [machine.error.toJSON()] : [],
    operations: machine.operations,
    seed: machine.seed,
    ...(options.world ? { world: options.world.state() } : {}),
    ...(trace ? { events, eventsTruncated } : {}),
  };
};

/** Varias ejecuciones que comparten variables, como en el REPL. */
export class Session {
  private readonly globals = new Scope();

  constructor(private readonly options: Omit<RunOptions, 'globals' | 'allowRedeclare'> = {}) {}

  run(source: string): RunResult {
    return run(source, { ...this.options, globals: this.globals, allowRedeclare: true });
  }
}
