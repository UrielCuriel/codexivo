import { ERROR_CODES } from './error-codes';
import type { ErrorKind } from './errors';
import { constantDocs, constants, natives, withoutAccents } from './runtime/builtins';
import { libraryDocs } from './runtime/prelude';
import type { ProcedureCategory, ProcedureDoc, ProcedureLevel } from './runtime/values';
import { KEYWORDS, TokenType } from './syntax/token';
import { EXAMPLE_WORLD, worldDocs } from './world';
import type { WorldDefinition } from './world';

/**
 * El lenguaje y su biblioteca como datos, para que el resaltado, el autocompletado, la documentación y los
 * avisos del editor del sitio salgan de una sola fuente. Todo es serializable: no hay funciones.
 */

export type KeywordGroup = 'declaración' | 'control' | 'lógicas' | 'literales' | 'operadores';

export interface OperatorEntry {
  symbol?: string;
  /** Forma en palabras (`es_igual_a`, `mod`), si la tiene. */
  word?: string;
  /** Nivel de precedencia de la §4.1: 1 es el que agrupa al final, 9 el primero. */
  precedence: number;
  associativity: 'izquierda' | 'derecha' | 'prefijo' | 'sin encadenar';
  description: string;
}

export interface ProcedureEntry extends ProcedureDoc {
  /** Nombre canónico, con acento si lo lleva. */
  name: string;
  /** Otras formas aceptadas (el nombre sin acento). */
  aliases: string[];
}

export interface ConstantEntry {
  name: string;
  value: number;
  level: ProcedureLevel;
  description: string;
}

export interface ErrorEntry {
  code: string;
  kind: ErrorKind;
  explanation: string;
}

export interface Catalog {
  version: 1;
  keywords: Array<{ group: KeywordGroup; words: string[] }>;
  operators: OperatorEntry[];
  /** Procedimientos de la biblioteca, incluidos los del modo mundo (categoría `mundo`). */
  library: ProcedureEntry[];
  constants: ConstantEntry[];
  errors: ErrorEntry[];
  categories: ProcedureCategory[];
  /** Mundo con el que se ejecutan los ejemplos de la categoría `mundo`. */
  exampleWorld: WorldDefinition;
}

const KEYWORD_GROUPS: Readonly<Record<string, KeywordGroup>> = {
  [TokenType.LET]: 'declaración',
  [TokenType.CONST]: 'declaración',
  [TokenType.DOMAIN]: 'declaración',
  [TokenType.FUNCTION]: 'declaración',
  [TokenType.RETURN]: 'declaración',
  [TokenType.IF]: 'control',
  [TokenType.ELSEIF]: 'control',
  [TokenType.ELSE]: 'control',
  [TokenType.WHILE]: 'control',
  [TokenType.DO]: 'control',
  [TokenType.UNTIL]: 'control',
  [TokenType.FOR]: 'control',
  [TokenType.FOR_EACH]: 'control',
  [TokenType.IN]: 'control',
  [TokenType.REPEAT]: 'control',
  [TokenType.TIMES]: 'control',
  [TokenType.BREAK]: 'control',
  [TokenType.CONTINUE]: 'control',
  [TokenType.AND]: 'lógicas',
  [TokenType.OR]: 'lógicas',
  [TokenType.NOT]: 'lógicas',
  [TokenType.TRUE]: 'literales',
  [TokenType.FALSE]: 'literales',
  [TokenType.NULL]: 'literales',
  [TokenType.MOD]: 'operadores',
  [TokenType.DIV]: 'operadores',
  [TokenType.EQ]: 'operadores',
  [TokenType.NEQ]: 'operadores',
  [TokenType.LT]: 'operadores',
  [TokenType.GT]: 'operadores',
  [TokenType.LTE]: 'operadores',
  [TokenType.GTE]: 'operadores',
};

const GROUP_ORDER: KeywordGroup[] = ['declaración', 'control', 'lógicas', 'literales', 'operadores'];

/** Grupo de cada palabra reservada; una palabra sin grupo es un error del catálogo (lo revisa una prueba). */
export const keywordGroup = (word: string): KeywordGroup | undefined => KEYWORD_GROUPS[KEYWORDS[word] ?? ''];

const keywords = GROUP_ORDER.map(group => ({
  group,
  words: Object.keys(KEYWORDS).filter(word => keywordGroup(word) === group),
}));

const operators: OperatorEntry[] = [
  {
    word: 'o',
    precedence: 1,
    associativity: 'izquierda',
    description: 'Verdadero si alguno de los dos lo es. Si el izquierdo es verdadero, no evalúa el derecho.',
  },
  {
    word: 'y',
    precedence: 2,
    associativity: 'izquierda',
    description: 'Verdadero si los dos lo son. Si el izquierdo es falso, no evalúa el derecho.',
  },
  {
    symbol: '!',
    word: 'no',
    precedence: 3,
    associativity: 'prefijo',
    description: 'Cambia verdadero por falso y al revés.',
  },
  {
    symbol: '==',
    word: 'es_igual_a',
    precedence: 4,
    associativity: 'sin encadenar',
    description: 'Igualdad por valor, también de listas y diccionarios.',
  },
  {
    symbol: '!=',
    word: 'es_distinto_de',
    precedence: 4,
    associativity: 'sin encadenar',
    description: 'Lo contrario de `==`.',
  },
  {
    symbol: '<',
    word: 'es_menor_que',
    precedence: 4,
    associativity: 'sin encadenar',
    description: 'Compara dos números o dos textos.',
  },
  {
    symbol: '>',
    word: 'es_mayor_que',
    precedence: 4,
    associativity: 'sin encadenar',
    description: 'Compara dos números o dos textos.',
  },
  {
    symbol: '<=',
    word: 'es_menor_o_igual_a',
    precedence: 4,
    associativity: 'sin encadenar',
    description: 'Compara dos números o dos textos.',
  },
  {
    symbol: '>=',
    word: 'es_mayor_o_igual_a',
    precedence: 4,
    associativity: 'sin encadenar',
    description: 'Compara dos números o dos textos.',
  },
  {
    symbol: '+',
    precedence: 5,
    associativity: 'izquierda',
    description: 'Suma dos números o une dos textos; no los mezcla.',
  },
  { symbol: '-', precedence: 5, associativity: 'izquierda', description: 'Resta.' },
  { symbol: '*', precedence: 6, associativity: 'izquierda', description: 'Multiplica.' },
  { symbol: '/', precedence: 6, associativity: 'izquierda', description: 'División real: `7 / 2` es `3.5`.' },
  {
    word: 'div',
    precedence: 6,
    associativity: 'izquierda',
    description: 'División entera hacia abajo: `-7 div 2` es `-4`.',
  },
  {
    symbol: '%',
    word: 'mod',
    precedence: 6,
    associativity: 'izquierda',
    description: 'Residuo consistente con `div`: `-7 mod 3` es `2`.',
  },
  { symbol: '-', precedence: 7, associativity: 'prefijo', description: 'Cambia el signo.' },
  {
    symbol: '^',
    precedence: 8,
    associativity: 'derecha',
    description: 'Potencia: `2 ^ 3 ^ 2` es `2 ^ 9`, y `-2 ^ 2` es `-4`.',
  },
  { symbol: '( )', precedence: 9, associativity: 'izquierda', description: 'Llama a un procedimiento: `f(x)`.' },
  {
    symbol: '[ ]',
    precedence: 9,
    associativity: 'izquierda',
    description: 'Elemento de una lista o texto, o clave de un diccionario: `l[0]`, `d["a"]`.',
  },
  {
    symbol: '.',
    precedence: 9,
    associativity: 'izquierda',
    description: 'Campo de un diccionario: `persona.edad` es `persona["edad"]`.',
  },
];

const entry = (name: string, doc: ProcedureDoc): ProcedureEntry => {
  const alias = withoutAccents(name);
  return { name, aliases: alias === name ? [] : [alias], ...doc };
};

const library: ProcedureEntry[] = [
  ...Object.values(natives)
    .filter((native, index, all) => all.indexOf(native) === index)
    .map(native => entry(native.name, native.doc!)),
  ...Object.entries(libraryDocs).map(([name, doc]) => entry(name, doc)),
  ...Object.entries(worldDocs).map(([name, doc]) => entry(name, doc)),
];

const CATEGORIES: ProcedureCategory[] = [
  'entrada y salida',
  'tipos',
  'matemáticas',
  'texto',
  'listas',
  'diccionarios',
  'procedimientos',
  'estructuras',
  'mundo',
];

export const catalog: Catalog = {
  version: 1,
  keywords,
  operators,
  library: library.sort(
    (a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) || a.name.localeCompare(b.name, 'es'),
  ),
  constants: Object.entries(constantDocs).map(([name, doc]) => ({
    name,
    value: constants[name] as number,
    ...doc,
  })),
  errors: Object.entries(ERROR_CODES)
    .map(([code, info]) => ({ code, ...info }))
    .sort((a, b) => a.code.localeCompare(b.code, 'es')),
  categories: CATEGORIES,
  exampleWorld: EXAMPLE_WORLD,
};
