import { isDict, isList } from './values';
import type { Value } from './values';

/**
 * Cuántas operaciones cuesta cada procedimiento de la biblioteca (§10). Es la única tabla de costos: la
 * usan los nativos de `builtins.ts` y los procedimientos de `prelude.ts`, y los retos del sitio comparan
 * soluciones con estas cifras. Un procedimiento que no aparece aquí cuesta 1, como cualquier operación.
 *
 * `n` es el tamaño (caracteres, elementos o claves) del primer argumento.
 */
export type Cost = (args: Value[]) => number;

/** Tamaño de un texto, lista o diccionario; 1 para lo demás. */
export const sizeOf = (value: Value | undefined): number => {
  if (typeof value === 'string') return value.length;
  if (value !== undefined && isList(value)) return value.items.length;
  if (value !== undefined && isDict(value)) return value.entries.size;
  return 1;
};

/** `n`: recorre su primer argumento una vez. */
const linear: Cost = args => Math.max(1, sizeOf(args[0]));

/** `n · ⌈log₂ n⌉`: lo que cuesta ordenar `n` elementos. */
const nLogN: Cost = args => {
  const n = sizeOf(args[0]);
  return Math.max(1, n * Math.ceil(Math.log2(Math.max(n, 1))));
};

/** Cuesta tantas casillas como crea. */
const creates =
  (count: (args: Value[]) => number): Cost =>
  args =>
    Math.max(1, Math.ceil(count(args)));

/** `n` de `máximo(…)` y `mínimo(…)`, que reciben varios números o una lista. */
const values: Cost = args => (args.length === 1 ? linear(args) : Math.max(1, args.length));

/** Largo del texto o lista que se busca (segundo argumento). */
const searched: Cost = args => Math.max(1, sizeOf(args[1]));

const slice: Cost = args =>
  typeof args[1] === 'number' && typeof args[2] === 'number' ? Math.max(1, Math.abs(args[2] - args[1])) : 1;

const range: Cost = args => {
  const [start, end, step = 1] = args;
  if (typeof start !== 'number' || typeof end !== 'number' || typeof step !== 'number' || step === 0) return 1;
  return Math.max(1, Math.floor((end - start) / step) + 1);
};

export const COSTS: Readonly<Partial<Record<string, Cost>>> = {
  // matemáticas
  máximo: values,
  mínimo: values,

  // texto
  mayúsculas: linear,
  minúsculas: linear,
  recortar: linear,
  dividir: linear,
  unir: linear,
  reemplazar: linear,
  contiene: linear,
  posición_de: linear,
  empieza_con: searched,
  termina_con: searched,
  subtexto: slice,
  caracteres: linear,
  invertir: linear,

  // listas
  insertar: linear,
  quitar: linear,
  quitar_primero: linear,
  desencolar: linear,
  rebanar: slice,
  copiar: linear,
  sumar: linear,
  ordenar: nLogN,
  rango: range,
  índices: linear,
  lista_de: creates(args => (typeof args[0] === 'number' ? args[0] * sizeOf(args[1]) : 1)),
  matriz: creates(args => (typeof args[0] === 'number' && typeof args[1] === 'number' ? args[0] * args[1] : 1)),

  // diccionarios
  claves: linear,
  valores: linear,

  // procedimientos como valores: además, cada llamada a `f` cuesta lo que cueste su cuerpo
  mapear: linear,
  filtrar: linear,
  reducir: linear,
  alguno: linear,
  todos: linear,
  buscar: linear,
};
