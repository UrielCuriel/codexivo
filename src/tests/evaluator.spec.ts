import { it, describe, expect } from 'vitest';

import { Program } from '../ast';
import { evaluate } from '../evaluator';
import { Lexer } from '../lexer';
import { Parser } from '../parser';
import { Number, Boolean, Null, Object, Error, Environment, Function, String } from '../object';

const testEval = (input: string): Object => {
  const lexer = new Lexer(input);
  const parser = new Parser(lexer);
  const program = parser.parseProgram();

  if (parser.errors.length > 0) {
    parser.errors.forEach(error => {
      console.log(error);
    });
  }
  expect(parser.errors).toEqual([]);

  const env = new Environment();
  const evaluated = evaluate(program, env);
  expect(evaluated).not.toBeUndefined();
  expect(evaluated).not.toBeNull();
  if (evaluated instanceof Error) {
    console.log('ERROR:', evaluated.message);
  }
  return evaluated;
};

const testNumberObject = (obj: Object, expected: number) => {
  expect(obj).toBeInstanceOf(Number);
  expect((obj as Number).value).toBe(expected);
};

const testBooleanObject = (obj: Object, expected: boolean) => {
  expect(obj).toBeInstanceOf(Boolean);
  expect((obj as Boolean).value).toBe(expected);
};

const testStringObject = (obj: Object, expected: string) => {
  expect(obj).toBeInstanceOf(String);
  expect((obj as String).value).toBe(expected);
};

const testErrorObject = (obj: Object, expected: string) => {
  expect(obj).toBeInstanceOf(Error);
  expect((obj as Error).message).toBe(expected);
};
const isTruthy = (obj: Object) => {};

describe('evaluator', () => {
  it('should evaluate integer expression', () => {
    const tests = [
      ['5;', 5],
      ['10;', 10],
      ['-5;', -5],
      ['-10;', -10],
      ['5 + 5 + 5 + 5 - 10;', 10],
      ['2 * 2 * 2 * 2 * 2;', 32],
      ['-50 + 100 + -50;', 0],
      ['5 * 2 + 10;', 20],
      ['5 + 2 * 10;', 25],
      ['20 + 2 * -10;', 0],
      ['50 / 2 * (2 + 10);', 300],
      ['(5 + 10 * 2 + 15 / 3) * 2 + -10;', 50],
      ['5 / 2;', 2.5],
      ['5.0/2;', 2.5],
      ['5/2.0;', 2.5],
      ['.8;', 0.8],
      ['0.8;', 0.8],
      ['0.8 + 0.2;', 1],
    ];

    tests.forEach(([input, expected]) => {
      const evaluated = testEval(input as string);
      testNumberObject(evaluated, expected as number);
    });
  });
  it('should evaluate boolean expression', () => {
    const tests = [
      ['verdadero;', true],
      ['falso;', false],
      ['1 < 2;', true],
      ['1 > 2;', false],
      ['1 < 1;', false],
      ['1 > 1;', false],
      ['1 >= 1;', true],
      ['1 <= 1;', true],
      ['1 <= 2;', true],
      ['1 >= 2;', false],
      ['1 == 1;', true],
      ['1 != 1;', false],
      ['1 == 2;', false],
      ['1 != 2;', true],
      ['verdadero == verdadero;', true],
      ['falso == falso;', true],
      ['verdadero == falso;', false],
      ['verdadero != falso;', true],
      ['(1 < 2) == verdadero;', true],
      ['(1 < 2) == falso;', false],
      ['(1 > 2) == verdadero;', false],
      ['(1 > 2) == falso;', true],
    ];

    tests.forEach(([input, expected]) => {
      const evaluated = testEval(input as string);
      testBooleanObject(evaluated, expected as boolean);
    });
  });
  it('should evaluate bang operator', () => {
    const tests = [
      ['!verdadero;', false],
      ['!falso;', true],
      ['!!verdadero;', true],
      ['!5;', false],
      ['!!5;', true],
    ];

    tests.forEach(([input, expected]) => {
      const evaluated = testEval(input as string);
      testBooleanObject(evaluated, expected as boolean);
    });
  });
  it('should evaluate if else expression', () => {
    const tests = [
      ['si (verdadero) { 10 }', 10],
      ['si (falso) { 10 }', null],
      ['si (1) { 10 }', 10],
      ['si (1 < 2) { 10 }', 10],
      ['si (1 > 2) { 10 }', null],
      ['si (1 > 2) { 10 } si_no { 20 }', 20],
      ['si (1 < 2) { 10 } si_no { 20 }', 10],
      ['si (1 > 2) { 10 } pero_si (1 < 2) { 20 }', 20],
      ['si (1 > 2) { 10 } pero_si (1 > 2) { 20 } si_no { 30 }', 30],
    ];

    tests.forEach(([input, expected]) => {
      const evaluated = testEval(input as string);
      if (expected) {
        testNumberObject(evaluated, expected as number);
      } else {
        expect(evaluated).toBeInstanceOf(Null);
      }
    });
  });
  it('should evaluate return statement', () => {
    const tests = [
      ['regresa 10;', 10],
      ['regresa 10; 9;', 10],
      ['regresa 2 * 5; 9;', 10],
      ['9; regresa 2 * 5; 9;', 10],
      [
        `
        si (10 > 1) {
          si (10 > 1) {
            regresa 10;
          }
          regresa 1;
        }
        `,
        10,
      ],
    ];

    tests.forEach(([input, expected]) => {
      const evaluated = testEval(input as string);
      testNumberObject(evaluated, expected as number);
    });
  });
  it('should handling errors', () => {
    const tests = [
      ['5 + verdadero;', 'tipo de operando desconocido: NUMBER + BOOLEAN en la linea 1 columna 3'],
      ['-verdadero', 'operador desconocido: -BOOLEAN en la linea 1 columna 1'],
      ['verdadero + falso;', 'operador desconocido: BOOLEAN + BOOLEAN en la linea 1 columna 11'],
      ['si (10 > 1) { verdadero + falso; }', 'operador desconocido: BOOLEAN + BOOLEAN en la linea 1 columna 25'],
      [
        `
        si (10 > 1) {
          si (10 > 1) {
            regresa verdadero / falso;
          }
          regresa 1;
        }
        `,
        'operador desconocido: BOOLEAN / BOOLEAN en la linea 4 columna 31',
      ],
      ['foobar', 'identificador no encontrado: foobar en la linea 1 columna 1'],
      ['"Hello" - "World"', 'operador desconocido: STRING - STRING en la linea 1 columna 9'],
    ];
    tests.forEach(([input, expected]) => {
      const evaluated = testEval(input as string);
      testErrorObject(evaluated, expected as string);
    });
  });
  it('should assignment evaluation', () => {
    const tests = [
      ['variable a = 5; a;', 5],
      ['variable a = 5 * 5; a;', 25],
      ['variable a = 5; variable b = a; b;', 5],
      ['variable a = 5; variable b = a; variable c = a + b + 5; c;', 15],
    ];

    tests.forEach(([input, expected]) => {
      const evaluated = testEval(input as string);
      testNumberObject(evaluated, expected as number);
    });
  });
  it('should evaluate function', () => {
    const input = 'procedimiento(x) { x + 2; };';
    const evaluated = testEval(input);
    expect(evaluated).toBeInstanceOf(Function);
    expect((evaluated as Function).parameters.length).toBe(1);
    expect((evaluated as Function).parameters[0].toString()).toBe('x');
    expect((evaluated as Function).body.toString()).toBe('(x + 2)');
  });
  it('should evaluate function call', () => {
    const tests = [
      ['variable identity = procedimiento(x) { x; }; identity(5);', 5],
      ['variable identity = procedimiento(x) { regresa x; }; identity(5);', 5],
      ['variable double = procedimiento(x) { x * 2; }; double(5);', 10],
      ['variable add = procedimiento(x, b) { x + b; }; add(5,  add(10,3));', 18],
    ];

    tests.forEach(([input, expected]) => {
      const evaluated = testEval(input as string);
      testNumberObject(evaluated, expected as number);
    });
  });
  it('should evaluate string literal', () => {
    const tests = [
      ['"hola mundo"', 'hola mundo'],
      ['procedimiento() { regresa "hola mundo"; }();', 'hola mundo'],
    ];

    tests.forEach(([input, expected]) => {
      const evaluated = testEval(input as string);
      testStringObject(evaluated, expected as string);
    });
  });
  it('should evaluate string concatenation', () => {
    const tests = [
      ['"hola" + " " + "mundo"', 'hola mundo'],
      ['"Foo" + "bar"', 'Foobar'],
      [
        `
          variable saludo = procedimiento(nombre) {
            regresa "Hola " + nombre + "!";
          };
          saludo("Uriel");
        `,
        'Hola Uriel!',
      ],
    ];

    tests.forEach(([input, expected]) => {
      const evaluated = testEval(input as string);
      testStringObject(evaluated, expected as string);
    });
  });
  it('should evaluate string comparison', () => {
    const tests = [
      ['"hola" == "hola"', true],
      ['"hola" == "mundo"', false],
      ['"hola" != "hola"', false],
      ['"hola" != "mundo"', true],
      ['"hola" == 1', false],
      ['"hola" != 1', true],
      ['1 == "hola"', false],
      ['1 != "hola"', true],
    ];

    tests.forEach(([input, expected]) => {
      const evaluated = testEval(input as string);
      testBooleanObject(evaluated, expected as boolean);
    });
  });
  it('should evaluate built-in functions', () => {
    const tests = [
      ['longitud("")', 0],
      ['longitud("cuatro")', 6],
      ['longitud("hola mundo")', 10],
      [
        'longitud(1)',
        `tipo de argumento incorrecto para 'longitud' se recibió NUMBER, se esperaba STRING en la linea 1 columna 9`,
      ],
      [
        'longitud("uno", "dos")',
        `numero incorrecto de argumentos para 'longitud' se recibieron 2, se esperaban 1 en la linea 1 columna 9`,
      ],
    ];

    tests.forEach(([input, expected]) => {
      const evaluated = testEval(input as string);
      if (typeof expected === 'number') {
        testNumberObject(evaluated, expected);
      } else {
        testErrorObject(evaluated, expected);
      }
    });
  });
});
