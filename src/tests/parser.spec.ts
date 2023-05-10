import { it, describe, expect } from "vitest";

import { Parser } from "../parser";
import { Lexer } from "../lexer";
import {
  Boolean,
  Identifier,
  Integer,
  Program,
  LetStatement,
  ReturnStatement,
  ExpressionStatement,
  PrefixExpression,
  InfixExpression,
} from "../ast";

function testProgramStatement(
  parser: Parser,
  program: Program,
  expectedStatementCount = 1
) {
  if (parser.errors.length > 0) {
    parser.errors.forEach((error) => {
      console.log(error);
    });
  }
  expect(parser.errors).toEqual([]);
  expect(program.statements.length).toBe(expectedStatementCount);
  expect(program.statements[0]).toBeInstanceOf(ExpressionStatement);
}

function testLiteralExpression(
  expression: any,
  expectedValue: any,
  expectedType?: any
) {
  expect(expression).not.toBeNull();
  if (typeof expectedValue === "string") {
    testIdentifier(expression, expectedValue, expectedType);
  } else if (typeof expectedValue === "number") {
    testInteger(expression, expectedValue, expectedType);
  } else if (typeof expectedValue === "boolean") {
    testBoolean(expression, expectedValue);
  } else {
    throw new Error("Not implemented");
  }
}

function testIdentifier(
  expression: any,
  expectedValue: string,
  expectedType: any
) {
  expect(expression).not.toBeNull();
  expect(expression).toBeInstanceOf(Identifier);
  expect(expression.value).toBe(expectedValue);
  expect(expression.tokenLiteral()).toBe(expectedValue);
}

function testInteger(
  expression: any,
  expectedValue: number,
  expectedType: any
) {
  expect(expression).not.toBeNull();
  expect(expression).toBeInstanceOf(Integer);
  expect(expression.value).toBe(expectedValue);
  expect(expression.tokenLiteral()).toBe(expectedValue.toString());
}

function testInfixExpression(
  expression: any,
  left: any,
  operator: string,
  right: any
) {
  expect(expression).not.toBeNull();
  expect(expression).toBeInstanceOf(InfixExpression);
  expect(expression.operator).toBe(operator);
  testLiteralExpression(expression.left, left);
  testLiteralExpression(expression.right, right);
}

function testBoolean(expression: any, value: boolean) {
  expect(expression).not.toBeNull();
  expect(expression).toBeInstanceOf(Boolean);
  expect(expression.value).toBe(value);
  expect(expression.tokenLiteral()).toBe(value.toString());
}

describe("parse", () => {
  it("should parse a program", () => {
    const source = ` variable x = 5;`;
    const lexer = new Lexer(source);
    const parse = new Parser(lexer);
    const program = parse.parseProgram();

    //expect program is not null
    expect(program).not.toBeNull();

    //expect type of program is Program
    expect(program).toBeInstanceOf(Program);
  });
  it("should parse a program with a let statements", () => {
    const source = `
      variable x = 5;
      variable n = 10;
      variable foobar = 838383;
      `;
    const lexer = new Lexer(source);
    const parse = new Parser(lexer);
    const program = parse.parseProgram();

    //expect program with 3 statements
    expect(program.statements.length).toBe(3);

    //expect every statement is a let statement
    program.statements.forEach((statement) => {
      expect(statement.tokenLiteral()).toBe("variable");
    });
  });
  it("should parse a program with a let statements and correct identifiers", () => {
    const source = `
    variable x = 5;
    variable n = 10;
    variable foobar = 838383;
    `;
    const lexer = new Lexer(source);
    const parse = new Parser(lexer);
    const program = parse.parseProgram();

    //expect program with 3 statements
    expect(program.statements.length).toBe(3);
    //expect every statement is a let statement and correct identifier
    const expectedIdentifiers = ["x", "n", "foobar"];
    program.statements.forEach((statement, index) => {
      expect(statement.tokenLiteral()).toBe("variable");
      expect((statement as any).name).not.toBeNull();
      expect((statement as any).name).toBeInstanceOf(Identifier);
      expect((statement as any).name.value).toBe(expectedIdentifiers[index]);
      expect((statement as any).name.tokenLiteral()).toBe(
        expectedIdentifiers[index]
      );
    });
  });

  it("should parse a program with errors", () => {
    const source = `variable x 5;`;
    const lexer = new Lexer(source);
    const parse = new Parser(lexer);
    const program = parse.parseProgram();

    //expect program with 1 errors
    expect(parse.errors.length).toBe(1);
    //expect correct error message
    expect(parse.errors[0]).toBe(
      "se esperaba que el siguiente token fuera ASSIGN pero se obtuvo INT"
    );
  });
  it("should parse a program with return statements", () => {
    const source = `
    regresa 5;
    regresa foo;
    `;
    const lexer = new Lexer(source);
    const parse = new Parser(lexer);
    const program = parse.parseProgram();

    //expect program with 2 statements
    expect(program.statements.length).toBe(2);

    //expect every statement is a return statement
    program.statements.forEach((statement) => {
      expect(statement.tokenLiteral()).toBe("regresa");
      expect(statement).toBeInstanceOf(ReturnStatement);
    });
  });
  it("should parse a program with expression statement", () => {
    const source = `foobar;`;
    const lexer = new Lexer(source);
    const parse = new Parser(lexer);
    const program = parse.parseProgram();

    testProgramStatement(parse, program);

    const statement: ExpressionStatement = program.statements[0];
    expect(statement.expression).not.toBeNull();
    testLiteralExpression(statement.expression, "foobar");
  });
  it("should parse a program with int expression", () => {
    const source = `5;`;
    const lexer = new Lexer(source);
    const parse = new Parser(lexer);
    const program = parse.parseProgram();

    testProgramStatement(parse, program);

    const statement: ExpressionStatement = program.statements[0];
    expect(statement.expression).not.toBeNull();
    expect(statement.expression).not.toBeUndefined();
    testLiteralExpression(statement.expression, 5);
  });

  it("should parse a program with prefix expression", () => {
    const source = `!5; -15;`;
    const lexer = new Lexer(source);
    const parse = new Parser(lexer);
    const program = parse.parseProgram();

    testProgramStatement(parse, program, 2);

    const statements: ExpressionStatement[] = program.statements;

    const expectedOperators = ["!", "-"];
    const expectedValues = [5, 15];

    statements.forEach((statement, index) => {
      expect(statement.expression).not.toBeNull();
      expect(statement.expression).not.toBeUndefined();

      const expression: PrefixExpression = statement.expression;
      expect(expression).toBeInstanceOf(PrefixExpression);
      expect(expression.operator).toBe(expectedOperators[index]);
      testLiteralExpression(expression.right, expectedValues[index]);
    });
  });
  it("should parse a program with infix expression", () => {
    const source = `
      5 + 5;
      5 - 5;
      5 * 5;
      5 / 5;
      5 > 5;
      5 < 5;
      5 >= 5;
      5 <= 5;
      5 == 5;
      5 != 5;
    `;
    const lexer = new Lexer(source);
    const parse = new Parser(lexer);
    const program = parse.parseProgram();

    testProgramStatement(parse, program, 10);

    const expectedOperatorsAndValues = [
      [5, "+", 5],
      [5, "-", 5],
      [5, "*", 5],
      [5, "/", 5],
      [5, ">", 5],
      [5, "<", 5],
      [5, ">=", 5],
      [5, "<=", 5],
      [5, "==", 5],
      [5, "!=", 5],
    ];

    program.statements.forEach((statement: ExpressionStatement, index) => {
      expect(statement.expression).not.toBeNull();
      expect(statement.expression).not.toBeUndefined();

      const expression: InfixExpression = statement.expression;
      expect(expression).toBeInstanceOf(InfixExpression);

      const expected = expectedOperatorsAndValues[index];
      testInfixExpression(
        expression,
        expected[0],
        expected[1] as string,
        expected[2]
      );
    });
  });
  it("should parse a program with boolean expression", () => {
    const source = `verdadero; falso;`;
    const lexer = new Lexer(source);
    const parse = new Parser(lexer);
    const program = parse.parseProgram();

    testProgramStatement(parse, program, 2);

    const expectedValues = [true, false];

    program.statements.forEach((statement: ExpressionStatement, index) => {
      expect(statement.expression).not.toBeNull();
      expect(statement.expression).not.toBeUndefined();

      testLiteralExpression(statement.expression, expectedValues[index]);
    });
  });
});
