import { describe, expect, test } from 'bun:test';
import { formatError, parse, run, walk } from '../src';

describe('API', () => {
  test('run reporta los errores de sintaxis sin ejecutar nada', () => {
    const result = run('imprimir("antes");\nvariable = 3;');
    expect(result.ok).toBe(false);
    expect(result.output).toBe('');
    expect(result.errors[0]?.kind).toBe('sintaxis');
  });

  test('formatError da un texto legible con ubicación y pista', () => {
    const [error] = run('variable x = 1;\nx / 0;').errors;
    expect(formatError(error!)).toBe(
      'Error de ejecución en la línea 2, columna 5: No se puede dividir entre cero.\n' +
        'Pista: Revisa que el divisor no valga 0 antes de dividir.',
    );
  });

  test('los errores se pueden serializar', () => {
    const [error] = run('1 / 0').errors;
    expect(JSON.parse(JSON.stringify(error))).toMatchObject({ kind: 'ejecución', code: 'DIVISIÓN_ENTRE_CERO' });
  });

  test('walk recorre todos los nodos del AST', () => {
    const { program } = parse(`
      variable f = procedimiento(a) { regresa [a, -a]; };
      si (f(1)[0] > 0 y verdadero) { } pero_si (falso) { } si_no { }
      hacer { } hasta_que (verdadero);
      para (variable i = 0; i < 1; i += 1) { mientras (falso) { } }
      "x"; nulo;
    `);
    const kinds = new Set<string>();
    walk(program, node => kinds.add(node.kind));
    expect([...kinds].sort()).toEqual(
      [
        'Assignment',
        'Binary',
        'Block',
        'BooleanLiteral',
        'Call',
        'DoUntil',
        'ExpressionStatement',
        'For',
        'FunctionLiteral',
        'Identifier',
        'If',
        'Index',
        'ListLiteral',
        'Logical',
        'NullLiteral',
        'NumberLiteral',
        'Program',
        'Return',
        'StringLiteral',
        'Unary',
        'VariableDeclaration',
        'While',
      ].sort(),
    );
  });

  test('el AST se puede serializar (por ejemplo, para enviarlo a un Web Worker)', () => {
    const { program } = parse('variable x = [1, 2];');
    expect(structuredClone(program)).toEqual(program);
  });
});
