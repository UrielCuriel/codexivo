import { describe, expect, test } from 'bun:test';
import { parse } from '../src';
import type { ast } from '../src';

/** Representación compacta de una expresión para revisar la precedencia: `(1 + (2 * 3))`. */
const show = (node: ast.Expression): string => {
  switch (node.kind) {
    case 'NumberLiteral':
      return String(node.value);
    case 'StringLiteral':
      return JSON.stringify(node.value);
    case 'BooleanLiteral':
      return node.value ? 'verdadero' : 'falso';
    case 'NullLiteral':
      return 'nulo';
    case 'Identifier':
      return node.name;
    case 'ListLiteral':
      return `[${node.elements.map(show).join(', ')}]`;
    case 'Unary':
      return `(${node.operator} ${show(node.operand)})`;
    case 'Binary':
    case 'Logical':
      return `(${show(node.left)} ${node.operator} ${show(node.right)})`;
    case 'Call':
      return `${show(node.callee)}(${node.args.map(show).join(', ')})`;
    case 'Index':
      return `${show(node.object)}[${show(node.index)}]`;
    case 'FunctionLiteral':
      return `procedimiento(${node.params.map(param => param.name).join(', ')})`;
  }
};

const expression = (source: string): string => {
  const { program, errors } = parse(source);
  expect(errors).toEqual([]);
  const statement = program.statements[0];
  if (statement?.kind !== 'ExpressionStatement') throw new Error(`no es una expresión: ${source}`);
  return show(statement.expression);
};

const errorCodes = (source: string) => parse(source).errors.map(error => error.code);

describe('parser', () => {
  describe('precedencia', () => {
    test.each([
      ['1 + 2 * 3', '(1 + (2 * 3))'],
      ['(1 + 2) * 3', '((1 + 2) * 3)'],
      ['1 - 2 - 3', '((1 - 2) - 3)'],
      ['8 / 4 / 2', '((8 / 4) / 2)'],
      ['-a * b', '((- a) * b)'],
      ['1 + 2 == 3', '((1 + 2) == 3)'],
      ['1 < 2 y 5 < 4', '((1 < 2) y (5 < 4))'],
      ['a o b y c', '(a o (b y c))'],
      ['a y b o c y d', '((a y b) o (c y d))'],
      ['no 1 == 2', '(no (1 == 2))'],
      ['!a y b', '((no a) y b)'],
      ['no a o b', '((no a) o b)'],
      ['f(1, 2)[0] + 1', '(f(1, 2)[0] + 1)'],
      ['lista[i + 1]', 'lista[(i + 1)]'],
      ['-f(x)', '(- f(x))'],
      ['[1, 2 + 3, "a"]', '[1, (2 + 3), "a"]'],
      ['a + b mod c', '(a + (b mod c))'],
      ['a % b * c', '((a mod b) * c)'],
      ['a div b - c', '((a div b) - c)'],
      ['2 ^ 3 ^ 2', '(2 ^ (3 ^ 2))'],
      ['-2 ^ 2', '(- (2 ^ 2))'],
      ['2 ^ -1', '(2 ^ (- 1))'],
      ['2 * 3 ^ 2', '(2 * (3 ^ 2))'],
      ['f(x) ^ 2', '(f(x) ^ 2)'],
      ['a es_menor_que b y b es_igual_a c', '((a < b) y (b == c))'],
      ['a es_mayor_o_igual_a 18', '(a >= 18)'],
    ])('%s', (source, expected) => {
      expect(expression(source)).toBe(expected);
    });
  });

  test('`pero_si` encadenados conservan todas las ramas en orden', () => {
    const { program, errors } = parse('si (a) { 1; } pero_si (b) { 2; } pero_si (c) { 3; } si_no { 4; }');
    expect(errors).toEqual([]);
    const node = program.statements[0] as ast.If;
    expect(node.branches.map(branch => show(branch.condition))).toEqual(['a', 'b', 'c']);
    expect(node.alternative?.statements).toHaveLength(1);
  });

  test('declaraciones, asignaciones y bucles', () => {
    const { program, errors } = parse(`
      variable total = 0;
      total += 5
      mientras (total < 10) { total = total + 1; }
      hacer { total -= 1; } hasta_que (total == 0);
      para (variable i = 0; i < 3; i += 1) { }
      regresa total;
    `);
    expect(errors).toEqual([]);
    expect(program.statements.map(statement => statement.kind)).toEqual([
      'VariableDeclaration',
      'Assignment',
      'While',
      'DoUntil',
      'For',
      'Return',
    ]);
  });

  test('el nombre de la variable se le da al procedimiento', () => {
    const { program } = parse('variable doble = procedimiento(x) { regresa x * 2; };');
    const declaration = program.statements[0] as ast.VariableDeclaration;
    expect(declaration.value).toMatchObject({ kind: 'FunctionLiteral', name: 'doble' });
  });

  test('el punto y coma es opcional al final de la línea', () => {
    expect(parse('variable x = 1\nx + 1\n').errors).toEqual([]);
  });

  test('cada nodo tiene un id único y su rango en el código', () => {
    const { program } = parse('variable x = 1 + 2;');
    const declaration = program.statements[0] as ast.VariableDeclaration;
    expect(declaration.span.start).toEqual({ line: 1, column: 1, offset: 0 });
    expect(declaration.value.span.start.column).toBe(14);
    expect(declaration.value.span.end.column).toBe(19);
    const ids = [program.id, declaration.id, declaration.name.id, declaration.value.id];
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('`i++`, `i--`, `%=` y `constante`', () => {
    const { program, errors } = parse('constante LÍMITE = 3;\nvariable i = 0;\ni++;\ni--\ni %= 2;');
    expect(errors).toEqual([]);
    expect(program.statements.map(statement => statement.kind)).toEqual([
      'VariableDeclaration',
      'VariableDeclaration',
      'Increment',
      'Increment',
      'Assignment',
    ]);
    expect(program.statements.map(statement => 'constant' in statement && statement.constant)).toEqual([
      true,
      false,
      false,
      false,
      false,
    ]);
    expect(program.statements[2]).toMatchObject({ target: { name: 'i' }, operator: '++' });
    expect(program.statements[4]).toMatchObject({ operator: '%=' });
  });

  test('`repetir n veces` y `i++` en un `para`', () => {
    const { program, errors } = parse('repetir 2 * 3 veces { }\npara (variable i = 0; i < 3; i++) { }');
    expect(errors).toEqual([]);
    const repeat = program.statements[0] as ast.Repeat;
    expect(repeat.kind).toBe('Repeat');
    expect(show(repeat.count)).toBe('(2 * 3)');
    expect((program.statements[1] as ast.For).update?.kind).toBe('Increment');
  });

  describe('errores', () => {
    test.each([
      ['1 < x < 5', 'COMPARACIÓN_ENCADENADA'],
      ['si x > 0 { }', 'TOKEN_ESPERADO'],
      ['si (x > 0) { ', 'BLOQUE_SIN_CERRAR'],
      ['variable si = 1', 'PALABRA_RESERVADA'],
      ['variable x', 'TOKEN_ESPERADO'],
      ['x = 1 2', 'FIN_DE_SENTENCIA'],
      ['si_no { }', 'RAMA_SIN_SI'],
      ['sino { }', 'PALABRA_DESCONOCIDA'],
      ['1 + ', 'EXPRESIÓN_INCOMPLETA'],
      ['}', 'LLAVE_SOBRANTE'],
      ['procedimiento(a, a) { }', 'PARÁMETRO_REPETIDO'],
      ['5 = x', 'ASIGNACIÓN_INVÁLIDA'],
      ['lista[]', 'ÍNDICE_VACÍO'],
      ['x = i++', 'INCREMENTO_EN_EXPRESIÓN'],
      ['f(i++)', 'INCREMENTO_EN_EXPRESIÓN'],
      ['++i', 'INCREMENTO_EN_EXPRESIÓN'],
      ['lista[0]++', 'INCREMENTO_EN_EXPRESIÓN'],
      ['repetir veces { }', 'REPETIR_SIN_CANTIDAD'],
      ['repetir 3 { }', 'TOKEN_ESPERADO'],
      ['constante K', 'TOKEN_ESPERADO'],
      ['variable mod = 1', 'PALABRA_RESERVADA'],
      ['variable es_igual_a = 1', 'PALABRA_RESERVADA'],
      ['variable veces = 1', 'PALABRA_RESERVADA'],
      ['romper', 'PALABRA_NO_DISPONIBLE'],
    ])('%s → %s', (source, code) => {
      expect(errorCodes(source)).toContain(code);
    });

    test('las pistas orientan hacia la forma correcta', () => {
      expect(parse('sino { }').errors[0]!.hint).toContain('si_no');
      expect(parse('si (x = 2) { }').errors[0]!.hint).toContain('==');
      expect(parse('1 < x < 5').errors[0]!.hint).toContain('y');
      expect(parse('x = i++').errors[0]!.hint).toContain('`i++;`');
      expect(parse('++i').errors[0]!.hint).toContain('`i++;`');
      expect(parse('constante K').errors[0]!.hint).toContain('constante K =');
    });

    test('se recupera y reporta errores en varias sentencias', () => {
      const { errors } = parse('variable = 1;\nvariable y = 2;\nx = ;');
      expect(errors.length).toBe(3);
      expect(errors.map(error => error.span?.start.line)).toEqual([1, 2, 3]);
    });

    test('un carácter desconocido no genera también un error de sintaxis', () => {
      const { errors } = parse('variable a = 5 @ 2;');
      expect(errors.map(error => error.kind)).toEqual(['léxico']);
    });
  });
});
