import { it, describe, expect } from 'vitest';

import { Program } from '../ast';
import { evaluate } from '../evaluator';
import { Lexer } from '../lexer';
import { Parser } from '../parser';
import { Integer, Boolean, Null, Object } from '../object';

const testEval = (input: string): Object => {
  const lexer = new Lexer(input);
  const parser = new Parser(lexer);
  const program = parser.parseProgram();
  return evaluate(program);
};

const testIntegerObject = (obj: Object, expected: number) => {
  expect(obj).toBeInstanceOf(Integer);
  expect((obj as Integer).value).toBe(expected);
};

describe('evaluator', () => {
  it('should evaluate integer expression', () => {
    const tests = [
      ['5;', 5],
      ['10;', 10],
    ];

    tests.forEach(([input, expected]) => {
      const evaluated = testEval(input as string);
      testIntegerObject(evaluated, expected as number);
    });
  });
});
