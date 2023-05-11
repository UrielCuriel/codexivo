import { it, describe, expect } from 'vitest';

import { ExpressionStatement, Identifier, LetStatement, Program, ReturnStatement } from '../ast';
import { Token, TokenType } from '../token';

describe('ast', () => {
  it('should create a program with let statements', () => {
    // variable mi_variable = otra_variable;
    const program = new Program([
      new LetStatement(
        new Token(TokenType.LET, 'variable'),
        new Identifier(new Token(TokenType.IDENT, 'mi_variable'), 'mi_variable'),
        new Identifier(new Token(TokenType.IDENT, 'otra_variable'), 'otra_variable'),
      ),
    ]);
    const programString = program.toString();

    expect(programString).toBe('variable mi_variable = otra_variable;');
  });
  it('should create a program with return statements', () => {
    // return 5;
    const program = new Program([
      new ReturnStatement(new Token(TokenType.RETURN, 'regresa'), new Identifier(new Token(TokenType.IDENT, '5'), '5')),
    ]);
    const programString = program.toString();

    expect(programString).toBe('regresa 5;');
  });
  it('should create a program with IDENT expressions ', () => {
    //foobar;
    const program = new Program([
      new ExpressionStatement(
        new Token(TokenType.IDENT, 'foobar'),
        new Identifier(new Token(TokenType.IDENT, 'foobar'), 'foobar'),
      ),
    ]);

    const programString = program.toString();

    expect(programString).toBe('foobar');
  });
  it('should create a program with INTEGER expressions ', () => {
    //5;
    const program = new Program([
      new ExpressionStatement(new Token(TokenType.INT, '5'), new Identifier(new Token(TokenType.INT, '5'), '5')),
    ]);

    const programString = program.toString();

    expect(programString).toBe('5');
  });
});
