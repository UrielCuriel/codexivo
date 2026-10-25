import { describe, expect, test } from 'bun:test';
import { compile, parse, walk } from '../src';
import type { Chunk, Instruction } from '../src';
import { assertNever } from '../src/assert';

/**
 * Cada tipo de nodo del AST tiene que llegar a la máquina. El evaluador de 2023 tenía un `else { return NULL }` que
 * ignoró los bucles en silencio durante dos años; aquí, un `kind` sin instrucciones es una prueba roja.
 */

const STATEMENT_KINDS = [
  'VariableDeclaration',
  'FunctionDeclaration',
  'Assignment',
  'Increment',
  'ExpressionStatement',
  'Return',
  'Block',
  'If',
  'While',
  'DoUntil',
  'For',
  'ForRange',
  'ForEach',
  'Repeat',
  'Break',
  'Continue',
  'Domain',
];

const EXPRESSION_KINDS = [
  'NumberLiteral',
  'StringLiteral',
  'BooleanLiteral',
  'NullLiteral',
  'ListLiteral',
  'DictLiteral',
  'Identifier',
  'Unary',
  'Binary',
  'Logical',
  'Call',
  'Index',
  'FunctionLiteral',
];

/** Un programa con todos los tipos de nodo. */
const EVERYTHING = `
  variable f = procedimiento(a) { regresa [a, -a] };
  procedimiento g(n) { regresa n }
  variable d = { "clave": 1 };
  si (f(1)[0] > 0 y verdadero) { } pero_si (falso) { } si_no { }
  hacer { } hasta_que (nulo == nulo);
  para (variable i = 0; i < 1; i += 1) { mientras (falso) { romper } }
  para j desde 1 hasta 2 { continuar }
  para_cada k, v en d { imprimir(k, v) }
  repetir 2 veces { }
  dominio dom { constante K = 1 }
  { x++ }
  "x"; no verdadero; g(d.clave) mod 2;
`;

/** Todos los nodos que referencian las instrucciones de un chunk y de los chunks que crea. */
const referencedKinds = (chunk: Chunk): Set<string> => {
  const kinds = new Set<string>();
  const visit = (current: Chunk) => {
    kinds.add(current.node.kind);
    for (const instruction of current.code) {
      for (const key of ['node', 'target', 'owner'] as const) {
        const node = (instruction as Instruction & Record<typeof key, { kind?: string } | undefined>)[key];
        if (node?.kind) kinds.add(node.kind);
      }
      if (instruction.op === 'closure') visit(instruction.chunk);
    }
  };
  visit(chunk);
  return kinds;
};

describe('exhaustividad', () => {
  const { program, errors } = parse(EVERYTHING);

  test('el programa de prueba cubre todos los tipos de nodo', () => {
    expect(errors).toEqual([]);
    const seen = new Set<string>();
    walk(program, node => seen.add(node.kind));
    expect([...seen].sort()).toEqual(['Program', ...STATEMENT_KINDS, ...EXPRESSION_KINDS].sort());
  });

  test('el compilador produce instrucciones para cada tipo de nodo', () => {
    const kinds = referencedKinds(compile(program));
    // Un bloque solo abre y cierra un alcance (`enterScope`/`exitScope`), instrucciones sin nodo.
    const expected = ['Program', ...STATEMENT_KINDS, ...EXPRESSION_KINDS].filter(kind => kind !== 'Block');
    expect(expected.filter(kind => !kinds.has(kind))).toEqual([]);
  });

  test('un nodo sin caso falla con un error interno claro', () => {
    expect(() => compile({ ...program, statements: [{ kind: 'Inventado' } as never] })).toThrow(
      'Error interno de Codexivo: sentencia sin caso',
    );
    expect(() => assertNever('x' as never, 'cosa')).toThrow('Error interno de Codexivo: cosa sin caso: x');
  });
});
