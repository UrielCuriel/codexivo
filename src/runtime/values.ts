import type { CodexivoError } from '../errors';
import type { Chunk } from './compiler';

/**
 * Valores en tiempo de ejecución. Números, textos, lógicos y `nulo` son primitivos de JavaScript;
 * listas y procedimientos son objetos con un `id` para poder dibujar cuándo dos variables
 * comparten el mismo valor.
 */
export type Value = number | string | boolean | null | ListValue | DictValue | ProcedureValue | NativeValue;

export interface ListValue {
  kind: 'lista';
  id: number;
  items: Value[];
}

/** Clave de un diccionario: un texto o un número. */
export type DictKey = string | number;

/** Diccionario: conserva el orden en que se agregaron las claves. */
export interface DictValue {
  kind: 'diccionario';
  id: number;
  entries: Map<DictKey, Value>;
}

export interface ProcedureValue {
  kind: 'procedimiento';
  id: number;
  name?: string;
  chunk: Chunk;
  closure: Scope;
}

/** Contexto que la máquina le da a los procedimientos nativos. */
export interface NativeContext {
  write(text: string): void;
  /** Siguiente línea de entrada, `null` si ya no hay, o `WAIT_FOR_INPUT` si hay que pedirla. */
  readLine(): string | null | typeof WAIT_FOR_INPUT;
  newList(items: Value[]): ListValue;
  newDict(entries: Map<DictKey, Value>): DictValue;
  /** Número pseudoaleatorio en [0, 1) del generador con semilla de la máquina. */
  random(): number;
  /** Error de ejecución ubicado en la llamada actual. */
  fail(code: string, message: string, hint?: string): CodexivoError;
}

export const WAIT_FOR_INPUT: unique symbol = Symbol('esperar-entrada');

export interface NativeValue {
  kind: 'nativo';
  name: string;
  /** Cantidad de argumentos: exacta, o `[mínimo, máximo]` (`máximo` puede ser `Infinity`). */
  arity: number | [number, number];
  call(args: Value[], context: NativeContext): Value | typeof WAIT_FOR_INPUT;
  /**
   * Cuántas operaciones debería costar una llamada con estos argumentos (§10). Sin `cost`, cuesta 1.
   * Se registra aquí para que la tabla de costos viva junto a cada procedimiento.
   */
  cost?: (args: Value[]) => number;
}

export type TypeName = 'número' | 'texto' | 'lógico' | 'nulo' | 'lista' | 'diccionario' | 'procedimiento';

export const typeOf = (value: Value): TypeName => {
  if (value === null) return 'nulo';
  switch (typeof value) {
    case 'number':
      return 'número';
    case 'string':
      return 'texto';
    case 'boolean':
      return 'lógico';
    default:
      return value.kind === 'lista' || value.kind === 'diccionario' ? value.kind : 'procedimiento';
  }
};

/** "un número", "una lista"… para mensajes. */
export const describeType = (type: TypeName): string => {
  switch (type) {
    case 'lista':
      return 'una lista';
    case 'nulo':
      return '`nulo`';
    default:
      return `un ${type}`;
  }
};

export const isList = (value: Value): value is ListValue =>
  typeof value === 'object' && value !== null && value.kind === 'lista';

export const isDict = (value: Value): value is DictValue =>
  typeof value === 'object' && value !== null && value.kind === 'diccionario';

export const isCallable = (value: Value): value is ProcedureValue | NativeValue =>
  typeof value === 'object' && value !== null && (value.kind === 'procedimiento' || value.kind === 'nativo');

const formatNumber = (value: number): string => {
  if (Object.is(value, -0)) return '0';
  if (value === Infinity) return 'infinito';
  if (value === -Infinity) return '-infinito';
  return String(value);
};

/** Representación como se escribiría en código: los textos van entre comillas. */
export const repr = (value: Value, seen: Set<ListValue | DictValue> = new Set()): string => {
  if (value === null) return 'nulo';
  switch (typeof value) {
    case 'number':
      return formatNumber(value);
    case 'string':
      return JSON.stringify(value);
    case 'boolean':
      return value ? 'verdadero' : 'falso';
  }
  if (value.kind === 'lista' || value.kind === 'diccionario') {
    if (seen.has(value)) return value.kind === 'lista' ? '[…]' : '{…}';
    seen.add(value);
    const inner =
      value.kind === 'lista'
        ? value.items.map(item => repr(item, seen))
        : [...value.entries].map(([key, item]) => `${repr(key)}: ${repr(item, seen)}`);
    seen.delete(value);
    return value.kind === 'lista' ? `[${inner.join(', ')}]` : `{${inner.join(', ')}}`;
  }
  return value.name ? `procedimiento ${value.name}` : 'procedimiento';
};

/** Como lo muestra `imprimir`: los textos sin comillas. */
export const show = (value: Value): string => (typeof value === 'string' ? value : repr(value));

type Container = ListValue | DictValue;

/**
 * Igualdad por valor: dos listas son iguales si tienen los mismos elementos en el mismo orden, y dos
 * diccionarios si tienen las mismas claves con los mismos valores, en cualquier orden.
 */
export const equals = (a: Value, b: Value, seen: Array<[Container, Container]> = []): boolean => {
  if (a === b) return true;
  const bothLists = isList(a) && isList(b);
  const bothDicts = isDict(a) && isDict(b);
  if (!bothLists && !bothDicts) return false;
  if (seen.some(([x, y]) => x === a && y === b)) return true;
  seen.push([a as Container, b as Container]);
  let result: boolean;
  if (bothLists) {
    const [x, y] = [a as ListValue, b as ListValue];
    result = x.items.length === y.items.length && x.items.every((item, index) => equals(item, y.items[index]!, seen));
  } else {
    const [x, y] = [a as DictValue, b as DictValue];
    result =
      x.entries.size === y.entries.size &&
      [...x.entries].every(([key, item]) => y.entries.has(key) && equals(item, y.entries.get(key)!, seen));
  }
  seen.pop();
  return result;
};

/**
 * Un alcance: las variables de un bloque. `parent` apunta al alcance que lo contiene.
 */
export class Scope {
  readonly variables = new Map<string, Value>();
  /** Nombres de este alcance declarados con `constante`. */
  readonly constants = new Set<string>();

  constructor(readonly parent?: Scope) {}

  lookup(name: string): Scope | undefined {
    let scope: Scope | undefined = this;
    while (scope) {
      if (scope.variables.has(name)) return scope;
      scope = scope.parent;
    }
    return undefined;
  }
}
