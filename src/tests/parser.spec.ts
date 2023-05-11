import { it, describe, expect } from "vitest";

import { Parser } from "../parser";
import { Lexer } from "../lexer";
import { Boolean, Identifier, If, Integer, Program, LetStatement, ReturnStatement, ExpressionStatement, Prefix, Infix } from "../ast";

function testProgramStatement(parser: Parser, program: Program, expectedStatementCount = 1) {
  if (parser.errors.length > 0) {
    parser.errors.forEach((error) => {
      console.log(error);
    });
  }
  expect(parser.errors).toEqual([]);
  expect(program.statements.length).toBe(expectedStatementCount);
  expect(program.statements[0]).toBeInstanceOf(ExpressionStatement);
}

function testLiteralExpression(expression: any, expectedValue: any, expectedType?: any) {
  expect(expression).not.toBeNull();
  if (typeof expectedValue === "string") {
    testIdentifier(expression, expectedValue);
  } else if (typeof expectedValue === "number") {
    testInteger(expression, expectedValue, expectedType);
  } else if (typeof expectedValue === "boolean") {
    testBoolean(expression, expectedValue);
  } else {
    throw new Error("Not implemented");
  }
}

function testIdentifier(expression: any, expectedValue: string) {
  expect(expression).not.toBeNull();
  expect(expression).toBeInstanceOf(Identifier);
  expect(expression.value).toBe(expectedValue);
  expect(expression.tokenLiteral()).toBe(expectedValue);
}

function testInteger(expression: any, expectedValue: number, expectedType: any) {
  expect(expression).not.toBeNull();
  expect(expression).toBeInstanceOf(Integer);
  expect(expression.value).toBe(expectedValue);
  expect(expression.tokenLiteral()).toBe(expectedValue.toString());
}

function testInfix(expression: any, left: any, operator: string, right: any) {
  expect(expression).not.toBeNull();
  expect(expression).toBeInstanceOf(Infix);
  expect(expression.operator).toBe(operator);
  testLiteralExpression(expression.left, left);
  testLiteralExpression(expression.right, right);
}

function testBoolean(expression: any, value: boolean) {
  expect(expression).not.toBeNull();
  expect(expression).toBeInstanceOf(Boolean);
  expect(expression.value).toBe(value);
  expect(expression.tokenLiteral()).toBe(value ? "verdadero" : "falso");
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
      expect((statement as any).name.tokenLiteral()).toBe(expectedIdentifiers[index]);
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
    expect(parse.errors[0]).toBe("se esperaba que el siguiente token fuera ASSIGN pero se obtuvo INT");
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
    const source = `!5; -15; !verdadero; !falso;`;
    const lexer = new Lexer(source);
    const parse = new Parser(lexer);
    const program = parse.parseProgram();

    testProgramStatement(parse, program, 4);

    const statements: ExpressionStatement[] = program.statements;

    const expectedOperators = ["!", "-", "!", "!"];
    const expectedValues = [5, 15, true, false];

    statements.forEach((statement, index) => {
      expect(statement.expression).not.toBeNull();
      expect(statement.expression).not.toBeUndefined();

      const expression: Prefix = statement.expression;
      expect(expression).toBeInstanceOf(Prefix);
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
      verdadero == verdadero;
      verdadero != falso;
      falso == falso;
      verdadero y falso;
      verdadero o falso;
    `;
    const lexer = new Lexer(source);
    const parse = new Parser(lexer);
    const program = parse.parseProgram();

    testProgramStatement(parse, program, 15);

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
      [true, "==", true],
      [true, "!=", false],
      [false, "==", false],
      [true, "y", false],
      [true, "o", false],
    ];

    program.statements.forEach((statement: ExpressionStatement, index) => {
      expect(statement.expression).not.toBeNull();
      expect(statement.expression).not.toBeUndefined();

      const expression: Infix = statement.expression;
      expect(expression).toBeInstanceOf(Infix);

      const expected = expectedOperatorsAndValues[index];
      testInfix(expression, expected[0], expected[1] as string, expected[2]);
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

  it("should parse a program with operator precedence", () => {
    const testsSources = [
      ["-a * b;", "((-a) * b)", 1],
      ["!-a;", "(!(-a))", 1],
      ["a + b / c;", "(a + (b / c))", 1],
      ["3 + 4; -5 * 5;", "(3 + 4)((-5) * 5)", 2],
      ["5 > 4 == 3 < 4;", "((5 > 4) == (3 < 4))", 1],
      ["5 < 4 != 3 > 4;", "((5 < 4) != (3 > 4))", 1],
      ["3 + 4 * 5 == 3 * 1 + 4 * 5;", "((3 + (4 * 5)) == ((3 * 1) + (4 * 5)))", 1],
      ["verdadero;", "verdadero", 1],
      ["falso;", "falso", 1],
      ["3 > 5 == falso;", "((3 > 5) == falso)", 1],
      ["3 < 5 == verdadero;", "((3 < 5) == verdadero)", 1],
      ["verdadero o falso y verdadero;", "(verdadero o (falso y verdadero))", 1],
      ["verdadero y falso o verdadero;", "((verdadero y falso) o verdadero)", 1],
      ["3 + 4 * 5 == 3 * 1 + 4 * 5;", "((3 + (4 * 5)) == ((3 * 1) + (4 * 5)))", 1],
      ["1 + (2 + 3) + 4;", "((1 + (2 + 3)) + 4)", 1],
      ["(5 + 5) * 2;", "((5 + 5) * 2)", 1],
      ["2 / (5 + 5);", "(2 / (5 + 5))", 1],
      ["-(5 + 5);", "(-(5 + 5))", 1],
    ];

    testsSources.forEach((test) => {
      const lexer = new Lexer(test[0] as string);
      const parse = new Parser(lexer);
      const program = parse.parseProgram();

      testProgramStatement(parse, program, test[2] as number);

      expect(program.toString()).toBe(test[1]);
    });
  });
  it("should parse a program with if expression", () => {
    const source = `si (m < n) { x }`;
    const lexer = new Lexer(source);
    const parse = new Parser(lexer);
    const program = parse.parseProgram();

    testProgramStatement(parse, program, 1);

    // Test if expression
    const If: If = (program.statements[0] as ExpressionStatement).expression as If;
    expect(If).toBeInstanceOf(If);

    // Test condition
    expect(If.condition).not.toBeNull();
    expect(If.condition).not.toBeUndefined();
    testInfix(If.condition, "m", "<", "n");

    // Test consequence
    expect(If.consequence).not.toBeNull();
    expect(If.consequence).not.toBeUndefined();
    expect(If.consequence?.statements.length).toBe(1);

    const consequenceStatement: ExpressionStatement = If.consequence?.statements[0] as ExpressionStatement;

    expect(consequenceStatement.expression).not.toBeNull();
    expect(consequenceStatement.expression).not.toBeUndefined();
    testIdentifier(consequenceStatement.expression, "x");
  });
  it("should parse a program with if else expression", () => {
    const source = `si (m < n) { x } si_no { z }`;
    const lexer = new Lexer(source);
    const parse = new Parser(lexer);
    const program = parse.parseProgram();

    testProgramStatement(parse, program, 1);

    // Test if expression
    const If: If = (program.statements[0] as ExpressionStatement).expression as If;

    expect(If).toBeInstanceOf(If);

    // Test condition
    expect(If.condition).not.toBeNull();
    expect(If.condition).not.toBeUndefined();
    testInfix(If.condition, "m", "<", "n");

    // Test consequence
    expect(If.consequence).not.toBeNull();
    expect(If.consequence).not.toBeUndefined();
    expect(If.consequence?.statements.length).toBe(1);

    const consequenceStatement: ExpressionStatement = If.consequence?.statements[0] as ExpressionStatement;

    expect(consequenceStatement.expression).not.toBeNull();
    expect(consequenceStatement.expression).not.toBeUndefined();
    testIdentifier(consequenceStatement.expression, "x");

    // Test alternative
    expect(If.alternative).not.toBeNull();
    expect(If.alternative).not.toBeUndefined();
    expect(If.alternative?.statements.length).toBe(1);

    const alternativeStatement: ExpressionStatement = If.alternative?.statements[0] as ExpressionStatement;

    expect(alternativeStatement.expression).not.toBeNull();
    expect(alternativeStatement.expression).not.toBeUndefined();

    testIdentifier(alternativeStatement.expression, "z");
  });
});
