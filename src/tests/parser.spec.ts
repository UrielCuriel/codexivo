import { it, describe, expect } from 'vitest';

import { Parser } from '../parser';
import { Lexer } from '../lexer';
import {
  Boolean,
  Call,
  Identifier,
  If,
  Number,
  Function,
  Program,
  LetStatement,
  ReturnStatement,
  ExpressionStatement,
  Prefix,
  Infix,
  While,
  DoWhile,
  For,
  StringLiteral,
  ArrayLiteral,
  Index,
} from '../ast';

function printProgram(program: Program) {
  console.log(JSON.stringify(program, null, 2));
}

function testProgramStatement(parser: Parser, program: Program, expectedStatementCount = 1) {
  if (parser.errors.length > 0) {
    parser.errors.forEach(error => {
      console.log(error);
    });
  }
  expect(parser.errors).toEqual([]);
  expect(program.statements.length).toBe(expectedStatementCount);
  expect(program.statements[0]).toBeInstanceOf(ExpressionStatement);
}

function testLiteralExpression(expression: any, expectedValue: any, expectedType?: any) {
  expect(expression).not.toBeNull();
  if (typeof expectedValue === 'string') {
    testIdentifier(expression, expectedValue);
  } else if (typeof expectedValue === 'number') {
    testNumber(expression, expectedValue, expectedType);
  } else if (typeof expectedValue === 'boolean') {
    testBoolean(expression, expectedValue);
  } else {
    throw new Error('Not implemented');
  }
}

function testLetStatement(statement: any, expectedName: string) {
  expect(statement).not.toBeNull();
  expect(statement).toBeInstanceOf(LetStatement);
  expect(statement.name.value).toBe(expectedName);
  expect(statement.name.tokenLiteral()).toBe(expectedName);
}

function testIdentifier(expression: any, expectedValue: string) {
  expect(expression).not.toBeNull();
  expect(expression).toBeInstanceOf(Identifier);
  expect(expression.value).toBe(expectedValue);
  expect(expression.tokenLiteral()).toBe(expectedValue);
}

function testNumber(expression: any, expectedValue: number, expectedType: any) {
  expect(expression).not.toBeNull();
  expect(expression).toBeInstanceOf(Number);
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
  expect(expression.tokenLiteral()).toBe(value ? 'verdadero' : 'falso');
}

describe('parse', () => {
  it('should parse a program', () => {
    const source = ` variable x = 5;`;
    const lexer = new Lexer(source);
    const parse = new Parser(lexer);
    const program = parse.parseProgram();

    //expect program is not null
    expect(program).not.toBeNull();

    //expect type of program is Program
    expect(program).toBeInstanceOf(Program);
  });
  it('should parse a program with a let statements', () => {
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
    program.statements.forEach(statement => {
      expect(statement.tokenLiteral()).toBe('variable');
    });
  });
  it('should parse a program with a let statements and correct identifiers', () => {
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
    const expectedIdentifiers = ['x', 'n', 'foobar'];
    program.statements.forEach((statement, index) => {
      expect(statement.tokenLiteral()).toBe('variable');
      expect((statement as any).name).not.toBeNull();
      expect((statement as any).name).toBeInstanceOf(Identifier);
      expect((statement as any).name.value).toBe(expectedIdentifiers[index]);
      expect((statement as any).name.tokenLiteral()).toBe(expectedIdentifiers[index]);
    });
  });

  it('should parse a program with errors', () => {
    const source = `variable x 5;`;
    const lexer = new Lexer(source);
    const parse = new Parser(lexer);
    const program = parse.parseProgram();

    //expect program with 1 errors
    expect(parse.errors.length).toBe(1);
    //expect correct error message
    expect(parse.errors[0]).toBe('se esperaba que el siguiente token fuera ASSIGN pero se obtuvo NUM');
  });
  it('should parse a program with return statements', () => {
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
    program.statements.forEach(statement => {
      expect(statement.tokenLiteral()).toBe('regresa');
      expect(statement).toBeInstanceOf(ReturnStatement);
    });
  });
  it('should parse a program with expression statement', () => {
    const source = `foobar;`;
    const lexer = new Lexer(source);
    const parse = new Parser(lexer);
    const program = parse.parseProgram();

    testProgramStatement(parse, program);

    const statement: ExpressionStatement = program.statements[0];
    expect(statement.expression).not.toBeNull();
    testLiteralExpression(statement.expression, 'foobar');
  });
  it('should parse a program with int expression', () => {
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

  it('should parse a program with prefix expression', () => {
    const source = `!5; -15; !verdadero; !falso;`;
    const lexer = new Lexer(source);
    const parse = new Parser(lexer);
    const program = parse.parseProgram();

    testProgramStatement(parse, program, 4);

    const statements: ExpressionStatement[] = program.statements;

    const expectedOperators = ['!', '-', '!', '!'];
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
  it('should parse a program with infix expression', () => {
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
      [5, '+', 5],
      [5, '-', 5],
      [5, '*', 5],
      [5, '/', 5],
      [5, '>', 5],
      [5, '<', 5],
      [5, '>=', 5],
      [5, '<=', 5],
      [5, '==', 5],
      [5, '!=', 5],
      [true, '==', true],
      [true, '!=', false],
      [false, '==', false],
      [true, 'y', false],
      [true, 'o', false],
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
  it('should parse a program with boolean expression', () => {
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

  it('should parse a program with operator precedence', () => {
    const testsSources = [
      ['-a * b;', '((-a) * b)', 1],
      ['!-a;', '(!(-a))', 1],
      ['a + b / c;', '(a + (b / c))', 1],
      ['3 + 4; -5 * 5;', '(3 + 4)((-5) * 5)', 2],
      ['5 > 4 == 3 < 4;', '((5 > 4) == (3 < 4))', 1],
      ['5 < 4 != 3 > 4;', '((5 < 4) != (3 > 4))', 1],
      ['3 + 4 * 5 == 3 * 1 + 4 * 5;', '((3 + (4 * 5)) == ((3 * 1) + (4 * 5)))', 1],
      ['verdadero;', 'verdadero', 1],
      ['falso;', 'falso', 1],
      ['3 > 5 == falso;', '((3 > 5) == falso)', 1],
      ['3 < 5 == verdadero;', '((3 < 5) == verdadero)', 1],
      ['verdadero o falso y verdadero;', '(verdadero o (falso y verdadero))', 1],
      ['verdadero y falso o verdadero;', '((verdadero y falso) o verdadero)', 1],
      ['3 + 4 * 5 == 3 * 1 + 4 * 5;', '((3 + (4 * 5)) == ((3 * 1) + (4 * 5)))', 1],
      ['1 + (2 + 3) + 4;', '((1 + (2 + 3)) + 4)', 1],
      ['(5 + 5) * 2;', '((5 + 5) * 2)', 1],
      ['2 / (5 + 5);', '(2 / (5 + 5))', 1],
      ['-(5 + 5);', '(-(5 + 5))', 1],
      ['suma(3,7) + suma(2,3);', '(suma(3, 7) + suma(2, 3))', 1],
      ['suma(3, suma(2,3));', 'suma(3, suma(2, 3))', 1],
      ['2 * 4 + resta(10, 5);', '((2 * 4) + resta(10, 5))', 1],
      ['resta(suma(2,3), suma(2,3));', 'resta(suma(2, 3), suma(2, 3))', 1],
    ];

    testsSources.forEach(test => {
      const lexer = new Lexer(test[0] as string);
      const parse = new Parser(lexer);
      const program = parse.parseProgram();

      testProgramStatement(parse, program, test[2] as number);

      expect(program.toString()).toBe(test[1]);
    });
  });
  it('should parse a program with if expression', () => {
    const source = `si (m < n) { x }`;
    const lexer = new Lexer(source);
    const parse = new Parser(lexer);
    const program = parse.parseProgram();

    testProgramStatement(parse, program, 1);

    // Test if expression
    const ifExpression: If = (program.statements[0] as ExpressionStatement).expression as If;

    expect(ifExpression).toBeInstanceOf(If);

    // Test condition
    expect(ifExpression.condition).not.toBeNull();
    expect(ifExpression.condition).not.toBeUndefined();
    testInfix(ifExpression.condition, 'm', '<', 'n');

    // Test consequence
    expect(ifExpression.consequence).not.toBeNull();
    expect(ifExpression.consequence).not.toBeUndefined();
    expect(ifExpression.consequence?.statements.length).toBe(1);

    const consequenceStatement: ExpressionStatement = ifExpression.consequence?.statements[0] as ExpressionStatement;

    expect(consequenceStatement.expression).not.toBeNull();
    expect(consequenceStatement.expression).not.toBeUndefined();
    testIdentifier(consequenceStatement.expression, 'x');
  });
  it('should parse a program with if else expression', () => {
    const source = `si (m < n) { x } si_no { z }`;
    const lexer = new Lexer(source);
    const parse = new Parser(lexer);
    const program = parse.parseProgram();

    testProgramStatement(parse, program, 1);

    // Test if expression
    const ifExpression: If = (program.statements[0] as ExpressionStatement).expression as If;

    expect(ifExpression).toBeInstanceOf(If);

    // Test condition
    expect(ifExpression.condition).not.toBeNull();
    expect(ifExpression.condition).not.toBeUndefined();
    testInfix(ifExpression.condition, 'm', '<', 'n');

    // Test consequence
    expect(ifExpression.consequence).not.toBeNull();
    expect(ifExpression.consequence).not.toBeUndefined();
    expect(ifExpression.consequence?.statements.length).toBe(1);

    const consequenceStatement: ExpressionStatement = ifExpression.consequence?.statements[0] as ExpressionStatement;

    expect(consequenceStatement.expression).not.toBeNull();
    expect(consequenceStatement.expression).not.toBeUndefined();
    testIdentifier(consequenceStatement.expression, 'x');

    // Test alternative
    expect(ifExpression.alternative).not.toBeNull();
    expect(ifExpression.alternative).not.toBeUndefined();
    expect(ifExpression.alternative?.statements.length).toBe(1);

    const alternativeStatement: ExpressionStatement = ifExpression.alternative?.statements[0] as ExpressionStatement;

    expect(alternativeStatement.expression).not.toBeNull();
    expect(alternativeStatement.expression).not.toBeUndefined();

    testIdentifier(alternativeStatement.expression, 'z');
  });
  it('should parse a program with for expression', () => {
    const source = `para(variable i = 0; i < 10; i += 1) { regresa x }`;
    const lexer = new Lexer(source);
    const parse = new Parser(lexer);
    const program = parse.parseProgram();

    testProgramStatement(parse, program, 1);

    // Test for expression
    const forExpression: For = (program.statements[0] as ExpressionStatement).expression as For;

    expect(forExpression).toBeInstanceOf(For);

    // Test initializer
    expect(forExpression.initializer).not.toBeNull();
    expect(forExpression.initializer).not.toBeUndefined();
    testLetStatement(forExpression.initializer as LetStatement, 'i');

    // Test condition
    expect(forExpression.condition).not.toBeNull();
    expect(forExpression.condition).not.toBeUndefined();
    testInfix(forExpression.condition, 'i', '<', 10);

    // Test increment
    expect(forExpression.increment).not.toBeNull();
    expect(forExpression.increment).not.toBeUndefined();
    testInfix(forExpression.increment, 'i', '+=', 1);

    // Test body
    expect(forExpression.body).not.toBeNull();
    expect(forExpression.body).not.toBeUndefined();
    expect(forExpression.body?.statements.length).toBe(1);

    const bodyStatement: ExpressionStatement = forExpression.body?.statements[0] as ExpressionStatement;

    expect(bodyStatement.expression).not.toBeNull();
    expect(bodyStatement.expression).not.toBeUndefined();
    testIdentifier(bodyStatement.expression, 'x');
  });
  it('should parse a program with while expression', () => {
    const source = `mientras (m < n) { x }`;
    const lexer = new Lexer(source);
    const parse = new Parser(lexer);
    const program = parse.parseProgram();

    testProgramStatement(parse, program, 1);

    // Test while expression
    const whileExpression: While = (program.statements[0] as ExpressionStatement).expression as While;

    expect(whileExpression).toBeInstanceOf(While);

    // Test condition
    expect(whileExpression.condition).not.toBeNull();
    expect(whileExpression.condition).not.toBeUndefined();
    testInfix(whileExpression.condition, 'm', '<', 'n');

    // Test body
    expect(whileExpression.body).not.toBeNull();
    expect(whileExpression.body).not.toBeUndefined();
    expect(whileExpression.body?.statements.length).toBe(1);

    const bodyStatement: ExpressionStatement = whileExpression.body?.statements[0] as ExpressionStatement;

    expect(bodyStatement.expression).not.toBeNull();
    expect(bodyStatement.expression).not.toBeUndefined();
    testIdentifier(bodyStatement.expression, 'x');
  });
  it('should parse a program with do while expression', () => {
    const source = `hacer { x } hasta_que (m < n);`;
    const lexer = new Lexer(source);
    const parse = new Parser(lexer);
    const program = parse.parseProgram();

    testProgramStatement(parse, program, 1);

    // Test do while expression
    const doWhileExpression: DoWhile = (program.statements[0] as ExpressionStatement).expression as DoWhile;

    expect(doWhileExpression).toBeInstanceOf(DoWhile);

    // Test condition
    expect(doWhileExpression.condition).not.toBeNull();
    expect(doWhileExpression.condition).not.toBeUndefined();
    testInfix(doWhileExpression.condition, 'm', '<', 'n');

    // Test body
    expect(doWhileExpression.body).not.toBeNull();
    expect(doWhileExpression.body).not.toBeUndefined();
    expect(doWhileExpression.body?.statements.length).toBe(1);

    const bodyStatement: ExpressionStatement = doWhileExpression.body?.statements[0] as ExpressionStatement;

    expect(bodyStatement.expression).not.toBeNull();
    expect(bodyStatement.expression).not.toBeUndefined();
    testIdentifier(bodyStatement.expression, 'x');
  });
  it('should parse a program with function literal', () => {
    const source = `procedimiento(x, n) { x + n; }`;
    const lexer = new Lexer(source);
    const parse = new Parser(lexer);
    const program = parse.parseProgram();

    //console.log(program.statements.length);

    testProgramStatement(parse, program);

    // Test function literal
    const functionLiteral: Function = (program.statements[0] as ExpressionStatement).expression as Function;

    expect(functionLiteral).toBeInstanceOf(Function);

    // Test parameters
    expect(functionLiteral.parameters?.length).toBe(2);

    const parametersValues = ['x', 'n'];

    functionLiteral.parameters?.forEach((parameter, index) => {
      expect(parameter).not.toBeNull();
      expect(parameter).not.toBeUndefined();
      testIdentifier(parameter, parametersValues[index]);
    });

    // Test body
    expect(functionLiteral.body).not.toBeNull();
    expect(functionLiteral.body).not.toBeUndefined();
    expect(functionLiteral.body?.statements.length).toBe(1);

    const bodyStatement: ExpressionStatement = functionLiteral.body?.statements[0] as ExpressionStatement;

    expect(bodyStatement.expression).not.toBeNull();
    expect(bodyStatement.expression).not.toBeUndefined();

    testInfix(bodyStatement.expression, 'x', '+', 'n');
  });
  it('should parse a program with function parameters', () => {
    const testsSources = [
      ['procedimiento() {};', [], 0],
      ['procedimiento(x) {};', ['x'], 1],
      ['procedimiento(x, v, z) {};', ['x', 'v', 'z'], 3],
    ];

    testsSources.forEach(test => {
      const lexer = new Lexer(test[0] as string);
      const parse = new Parser(lexer);
      const program = parse.parseProgram();

      testProgramStatement(parse, program, 1);

      // Test function literal
      const functionLiteral: Function = (program.statements[0] as ExpressionStatement).expression as Function;

      expect(functionLiteral).toBeInstanceOf(Function);

      // Test parameters
      expect(functionLiteral.parameters?.length).toBe((test[1] as string).length);

      (test[1] as string[]).forEach((param, index) => {
        testLiteralExpression(functionLiteral.parameters[index], param);
      });
    });
  });
  it('should parse a program with call expression', () => {
    const source = `suma(1, 2 * 3, 4 + 5);`;
    const lexer = new Lexer(source);
    const parse = new Parser(lexer);
    const program = parse.parseProgram();

    testProgramStatement(parse, program, 1);

    // Test call expression
    const callExpression: Call = (program.statements[0] as ExpressionStatement).expression as Call;

    expect(callExpression).toBeInstanceOf(Call);

    testIdentifier(callExpression.function_, 'suma');

    // Test arguments
    expect(callExpression.arguments_?.length).toBe(3);
    if (!callExpression.arguments_) return;
    testLiteralExpression(callExpression.arguments_[0], 1);
    testInfix(callExpression.arguments_[1], 2, '*', 3);
    testInfix(callExpression.arguments_[2], 4, '+', 5);
  });

  it('should parse a program with reserved words as identifiers and return errors', () => {
    const testsSources = [
      ['variable variable = 1;', 'variable', 'variable'],
      ['variable si = 1;', 'si', 'variable'],
      ['variable no = 1;', 'no', 'variable'],
      ['variable mientras = 1;', 'mientras', 'variable'],
      ['variable hacer = 1;', 'hacer', 'variable'],
      ['variable hasta_que = 1;', 'hasta_que', 'variable'],
      ['variable procedimiento = 1;', 'procedimiento', 'variable'],
      ['variable función = procedimiento(x,y) { x + y; };', 'y', 'parámetro'],
    ];

    testsSources.forEach(test => {
      const lexer = new Lexer(test[0] as string);
      const parse = new Parser(lexer);
      const program = parse.parseProgram();

      expect(parse.errors.length).toBeGreaterThan(0);

      expect(parse.errors[0]).toBe(`no se puede usar la palabra reservada '${test[1]}' como nombre de ${test[2]}`);
    });
  });
  it('should parse a program with string literal', () => {
    const source = `"hola mundo!";`;
    const lexer = new Lexer(source);
    const parse = new Parser(lexer);
    const program = parse.parseProgram();
    const expressionStatement = program.statements[0] as ExpressionStatement;
    const stringLiteral = expressionStatement.expression as StringLiteral;
    expect(stringLiteral).toBeInstanceOf(StringLiteral);
    expect(stringLiteral.value).toBe('hola mundo!');
  });

  it('should parse a program with array literal', () => {
    const source = `[1, 2 * 2, 3 + 3];`;
    const lexer = new Lexer(source);
    const parse = new Parser(lexer);
    const program = parse.parseProgram();
    const expressionStatement = program.statements[0] as ExpressionStatement;
    const arrayLiteral = expressionStatement.expression as ArrayLiteral;
    expect(arrayLiteral).toBeInstanceOf(ArrayLiteral);
    expect(arrayLiteral.elements.length).toBe(3);
  });

  it('should parse a program with index expression', () => {
    const source = `ident[1 + 1];`;
    const lexer = new Lexer(source);
    const parse = new Parser(lexer);
    const program = parse.parseProgram();

    testProgramStatement(parse, program, 1);

    const expressionStatement = program.statements[0] as ExpressionStatement;
    const indexExpression = expressionStatement.expression as Index;

    expect(indexExpression).toBeInstanceOf(Index);
    testIdentifier(indexExpression.left, 'ident');
    testInfix(indexExpression.index, 1, '+', 1);
  });
});
