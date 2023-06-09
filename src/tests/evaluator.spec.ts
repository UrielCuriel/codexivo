import { it, describe, expect } from 'vitest';

import { Program } from '../ast';
import { evaluate } from '../evaluator';
import { Lexer } from '../lexer';
import { Parser } from '../parser';
import { Number, Boolean, Null, Object } from '../object';

const testEval = (input: string): Object => {
  const lexer = new Lexer(input);
  const parser = new Parser(lexer);
  const program = parser.parseProgram();
  return evaluate(program);
};

const testNumberObject = (obj: Object, expected: number) => {
  expect(obj).toBeInstanceOf(Number);
  expect((obj as Number).value).toBe(expected);
};

const testBooleanObject = (obj: Object, expected: boolean) => {
  expect(obj).toBeInstanceOf(Boolean);
  expect((obj as Boolean).value).toBe(expected);
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
});
