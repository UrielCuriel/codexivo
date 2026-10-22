import type { Span } from './syntax/token';

export type ErrorKind = 'léxico' | 'sintaxis' | 'ejecución' | 'límite';

export interface ErrorInfo {
  kind: ErrorKind;
  code: string;
  message: string;
  hint?: string;
  span?: Span;
  /** Nombres de los procedimientos activos cuando ocurrió el error, del más externo al más interno. */
  callStack?: string[];
}

/**
 * Error de Codexivo. Siempre describe qué pasó (`message`) y, cuando es posible,
 * qué revisar (`hint`) y dónde (`span`).
 */
export class CodexivoError extends Error implements ErrorInfo {
  kind: ErrorKind;
  code: string;
  hint?: string;
  span?: Span;
  callStack?: string[];

  constructor(info: ErrorInfo) {
    super(info.message);
    this.name = 'CodexivoError';
    this.kind = info.kind;
    this.code = info.code;
    this.hint = info.hint;
    this.span = info.span;
    this.callStack = info.callStack;
  }

  toJSON(): ErrorInfo {
    return {
      kind: this.kind,
      code: this.code,
      message: this.message,
      hint: this.hint,
      span: this.span,
      callStack: this.callStack,
    };
  }
}

/** Texto legible de un error, como lo muestran el REPL y la consola del sandbox. */
export const formatError = (error: ErrorInfo): string => {
  const where = error.span ? ` en la línea ${error.span.start.line}, columna ${error.span.start.column}` : '';
  const lines = [`Error de ${error.kind}${where}: ${error.message}`];
  if (error.hint) {
    lines.push(`Pista: ${error.hint}`);
  }
  return lines.join('\n');
};
