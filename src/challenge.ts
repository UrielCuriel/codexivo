import { run } from './engine';
import type { ErrorInfo } from './errors';
import { equals, repr } from './runtime/values';
import type { DictKey, Value } from './runtime/values';

/**
 * Retos: un conjunto de casos que se ejecutan con su propia entrada y su propio límite de operaciones. Corre
 * igual en el worker del sitio y en Bun, así los retos se prueban en CI.
 *
 * - Estilo `salida` (como HackerRank): el programa lee con `leer()` y se compara lo que imprime.
 * - Estilo `regresa` (como LeetCode): se llama a `resolver(…)` (u otro procedimiento) con argumentos y se compara
 *   lo que regresa, por valor.
 */

/** Un valor de JSON: los arreglos se vuelven listas y los objetos, diccionarios. */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface ChallengeCase {
  name?: string;
  /** Entrada estándar: un texto (una línea por renglón) o una lista de líneas. */
  input?: string | string[];
  /** Estilo `salida`: lo que el programa tiene que imprimir. */
  expectedOutput?: string;
  /** Estilo `regresa`: los argumentos para el procedimiento. */
  args?: JsonValue[];
  /** Estilo `regresa`: lo que tiene que regresar. */
  expected?: JsonValue;
  /** Límite de operaciones de este caso; si no, el del reto. */
  maxOperations?: number;
}

export interface Challenge {
  style: 'salida' | 'regresa';
  cases: ChallengeCase[];
  /** Estilo `regresa`: el procedimiento que se llama. Por defecto `resolver`. */
  procedure?: string;
  /** Límite de operaciones por caso. Por defecto 1 000 000. */
  maxOperations?: number;
  /**
   * Con `true`, la salida tiene que ser idéntica. Si no, se ignoran los espacios al final de cada línea y las
   * líneas vacías del final.
   */
  exactOutput?: boolean;
}

export interface CaseResult {
  name: string;
  passed: boolean;
  output: string;
  expectedOutput?: string;
  /** Estilo `regresa`: lo que regresó y lo que se esperaba, como se escribirían en código. */
  result?: string;
  expected?: string;
  operations: number;
  error?: ErrorInfo;
}

export interface ChallengeResult {
  passed: boolean;
  cases: CaseResult[];
}

const DEFAULT_MAX_OPERATIONS = 1_000_000;

/** Un valor de JSON escrito como literal de Codexivo. */
const literal = (value: JsonValue): string => {
  if (value === null) return 'nulo';
  if (typeof value === 'boolean') return value ? 'verdadero' : 'falso';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`El reto tiene un número que no es finito: ${value}.`);
    return value < 0 ? `(${value})` : String(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(literal).join(', ')}]`;
  return `{ ${Object.entries(value)
    .map(([key, item]) => `${JSON.stringify(key)}: ${literal(item)}`)
    .join(', ')} }`;
};

/** Un valor de JSON como valor de Codexivo, para comparar por valor con `equals`. */
const toValue = (value: JsonValue): Value => {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return { kind: 'lista', id: 0, items: value.map(toValue) };
  return {
    kind: 'diccionario',
    id: 0,
    entries: new Map<DictKey, Value>(Object.entries(value).map(([key, item]) => [key, toValue(item)])),
  };
};

const normalize = (text: string): string =>
  text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n+$/, '');

/** Ejecuta cada caso del reto con el código de quien lo resuelve. */
export const evaluarReto = (source: string, challenge: Challenge): ChallengeResult => {
  const procedure = challenge.procedure ?? 'resolver';
  const cases = challenge.cases.map((testCase, index): CaseResult => {
    const name = testCase.name ?? `Caso ${index + 1}`;
    const maxOperations = testCase.maxOperations ?? challenge.maxOperations ?? DEFAULT_MAX_OPERATIONS;
    const input = testCase.input ?? [];

    if (challenge.style === 'salida') {
      const result = run(source, { input, maxOperations });
      const expectedOutput = testCase.expectedOutput ?? '';
      const same = challenge.exactOutput
        ? result.output === expectedOutput
        : normalize(result.output) === normalize(expectedOutput);
      return {
        name,
        passed: result.ok && same,
        output: result.output,
        expectedOutput,
        operations: result.operations,
        ...(result.errors[0] ? { error: result.errors[0] } : {}),
      };
    }

    // La llamada va al final, en su propia línea, para que los errores del programa conserven su lugar.
    const call = `\n;\nregresa ${procedure}(${(testCase.args ?? []).map(literal).join(', ')});\n`;
    const result = run(source + call, { input, maxOperations });
    const expected = toValue(testCase.expected ?? null);
    return {
      name,
      passed: result.ok && equals(result.result, expected),
      output: result.output,
      result: result.resultText,
      expected: repr(expected),
      operations: result.operations,
      ...(result.errors[0] ? { error: result.errors[0] } : {}),
    };
  });
  return { passed: cases.every(testCase => testCase.passed), cases };
};
