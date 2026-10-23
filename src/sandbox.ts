import type { Challenge, ChallengeResult } from './challenge';
import type { Loaded, Progress, SandboxOptions, SandboxRequest, SandboxResponse, Stopped } from './sandbox-host';

/** Lo que `createSandbox` necesita de un worker (un `Worker` del navegador o de Bun). */
export interface WorkerLike {
  postMessage(message: SandboxRequest): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<SandboxResponse>) => void): void;
  terminate?(): void;
}

export interface Sandbox {
  /** Analiza el código; si no tiene errores, queda listo para ejecutarse. */
  load(source: string, options?: SandboxOptions): Promise<Loaded>;
  /** Ejecuta hasta terminar, sin detenerse en los puntos de interrupción. */
  run(): Promise<Stopped>;
  /** Ejecuta hasta el siguiente punto de interrupción, o hasta terminar. */
  resume(): Promise<Stopped>;
  step(): Promise<Stopped>;
  /** Pide pausar; la promesa de `run()` o `resume()` se resuelve con el estado en el que quedó. */
  pause(): Promise<void>;
  /** Retrocede (o avanza) hasta el paso `n` volviendo a ejecutar desde el inicio. */
  goToStep(step: number): Promise<Stopped>;
  provideInput(line: string): Promise<void>;
  closeInput(): Promise<void>;
  setBreakpoints(lines: number[]): Promise<void>;
  evaluarReto(source: string, challenge: Challenge): Promise<ChallengeResult>;
  /** Progreso de cada tanda (operaciones, salida nueva, eventos). Regresa cómo dejar de escuchar. */
  onProgress(listener: (progress: Progress) => void): () => void;
  /** Cada vez que la ejecución se detiene. Regresa cómo dejar de escuchar. */
  onStopped(listener: (stopped: Stopped) => void): () => void;
  terminate(): void;
}

type Body<T extends SandboxRequest['type']> = Omit<Extract<SandboxRequest, { type: T }>, 'id'>;

/** Envuelve el worker de `codexivo/worker` con promesas y suscripciones. */
export const createSandbox = (worker: WorkerLike): Sandbox => {
  let nextId = 1;
  const pending = new Map<number, { resolve: (value: never) => void; reject: (error: Error) => void }>();
  const progressListeners = new Set<(progress: Progress) => void>();
  const stoppedListeners = new Set<(stopped: Stopped) => void>();

  worker.addEventListener('message', ({ data }) => {
    if (data.type === 'progreso') {
      for (const listener of progressListeners) listener(data);
      return;
    }
    if (data.type === 'detenido') for (const listener of stoppedListeners) listener(data);
    const request = pending.get(data.id);
    if (!request) return;
    pending.delete(data.id);
    if (data.type === 'error') request.reject(new Error(data.message));
    else if (data.type === 'hecho') request.resolve(undefined as never);
    else if (data.type === 'reto') request.resolve(data.result as never);
    else request.resolve(data as never);
  });

  const send = <T extends SandboxRequest['type'], R>(type: T, body: Omit<Body<T>, 'type'> = {} as never) =>
    new Promise<R>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve: resolve as (value: never) => void, reject });
      worker.postMessage({ type, id, ...body } as SandboxRequest);
    });

  const subscribe = <T>(listeners: Set<T>, listener: T) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  return {
    load: (source, options) => send<'cargar', Loaded>('cargar', { source, ...(options ? { options } : {}) }),
    run: () => send<'ejecutar', Stopped>('ejecutar'),
    resume: () => send<'continuar', Stopped>('continuar'),
    step: () => send<'paso', Stopped>('paso'),
    pause: () => send<'pausar', void>('pausar'),
    goToStep: step => send<'ir_a_paso', Stopped>('ir_a_paso', { step }),
    provideInput: line => send<'entrada', void>('entrada', { line }),
    closeInput: () => send<'cerrar_entrada', void>('cerrar_entrada'),
    setBreakpoints: lines => send<'puntos_de_interrupción', void>('puntos_de_interrupción', { lines }),
    evaluarReto: (source, challenge) => send<'evaluar_reto', ChallengeResult>('evaluar_reto', { source, challenge }),
    onProgress: listener => {
      const unsubscribe = subscribe(progressListeners, listener);
      return () => void unsubscribe();
    },
    onStopped: listener => {
      const unsubscribe = subscribe(stoppedListeners, listener);
      return () => void unsubscribe();
    },
    terminate: () => {
      worker.terminate?.();
      for (const request of pending.values()) request.reject(new Error('El sandbox se cerró.'));
      pending.clear();
    },
  };
};
