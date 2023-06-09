import { assertType, expect, expectTypeOf, it, describe } from 'vitest';
import { Lexer } from '../lexer';

import { Token, TokenType } from '../token';

describe('lexer', () => {
  it('lexer illegal Tokens', () => {
    const source = '¡¿@';
    const lexer = new Lexer(source);

    const tokens: Token[] = [];
    source.split('').forEach(() => {
      tokens.push(lexer.nextToken());
    });

    const expectedTokens: Token[] = [
      new Token(TokenType.ILLEGAL, '¡', 1, 1),
      new Token(TokenType.ILLEGAL, '¿', 1, 2),
      new Token(TokenType.ILLEGAL, '@', 1, 3),
    ];

    expect(tokens).toEqual(expectedTokens);
  });
  it('lexer One Character Operators', () => {
    const source = '=+-*/<>!';
    const lexer = new Lexer(source);
    const tokens: Token[] = [];
    source.split('').forEach(() => {
      tokens.push(lexer.nextToken());
    });
    const expectedTokens: Token[] = [
      new Token(TokenType.ASSIGN, '=', 1, 1),
      new Token(TokenType.PLUS, '+', 1, 2),
      new Token(TokenType.MINUS, '-', 1, 3),
      new Token(TokenType.ASTERISK, '*', 1, 4),
      new Token(TokenType.SLASH, '/', 1, 5),
      new Token(TokenType.LT, '<', 1, 6),
      new Token(TokenType.GT, '>', 1, 7),
      new Token(TokenType.BANG, '!', 1, 8),
    ];
    expect(tokens).toEqual(expectedTokens);
  });
  it('lexer EOF Token', () => {
    const source = '=';
    const lexer = new Lexer(source);
    const tokens: Token[] = [];

    for (let i = 0; i < source.length + 1; i++) {
      tokens.push(lexer.nextToken());
    }
    const expectedTokens: Token[] = [new Token(TokenType.ASSIGN, '=', 1, 1), new Token(TokenType.EOF, '', 1, 2)];
    expect(tokens).toEqual(expectedTokens);
  });
  it('lexer delimiters', () => {
    const source = '(){},;';
    const lexer = new Lexer(source);
    const tokens: Token[] = [];
    source.split('').forEach(() => {
      tokens.push(lexer.nextToken());
    });
    const expectedTokens: Token[] = [
      new Token(TokenType.LPAREN, '(', 1, 1),
      new Token(TokenType.RPAREN, ')', 1, 2),
      new Token(TokenType.LBRACE, '{', 1, 3),
      new Token(TokenType.RBRACE, '}', 1, 4),
      new Token(TokenType.COMMA, ',', 1, 5),
      new Token(TokenType.SEMICOLON, ';', 1, 6),
    ];
    expect(tokens).toEqual(expectedTokens);
  });
  it('lexer assignment', () => {
    const source = `variable cinco = 55;`;
    const lexer = new Lexer(source);
    const tokens: Token[] = [];
    for (let i = 0; i < 5; i++) {
      tokens.push(lexer.nextToken());
    }
    const expectedTokens: Token[] = [
      new Token(TokenType.LET, 'variable', 1, 1),
      new Token(TokenType.IDENT, 'cinco', 1, 10),
      new Token(TokenType.ASSIGN, '=', 1, 16),
      new Token(TokenType.NUM, '55', 1, 18),
      new Token(TokenType.SEMICOLON, ';', 1, 20),
    ];
    expect(tokens).toEqual(expectedTokens);
  });
  it('lexer declaration', () => {
    const source = `variable cinco;`;
    const lexer = new Lexer(source);
    const tokens: Token[] = [];
    for (let i = 0; i < 3; i++) {
      tokens.push(lexer.nextToken());
    }
    const expectedTokens: Token[] = [
      new Token(TokenType.LET, 'variable', 1, 1),
      new Token(TokenType.IDENT, 'cinco', 1, 10),
      new Token(TokenType.SEMICOLON, ';', 1, 15),
    ];
    expect(tokens).toEqual(expectedTokens);
  });
  it('lexer function declaration', () => {
    const source = `variable suma = procedimiento(x, n) { 
      x + n; 
    };`;
    const lexer = new Lexer(source);
    const tokens: Token[] = [];
    for (let i = 0; i < 16; i++) {
      tokens.push(lexer.nextToken());
    }
    const expectedTokens: Token[] = [
      new Token(TokenType.LET, 'variable', 1, 1),
      new Token(TokenType.IDENT, 'suma', 1, 10),
      new Token(TokenType.ASSIGN, '=', 1, 15),
      new Token(TokenType.FUNCTION, 'procedimiento', 1, 17),
      new Token(TokenType.LPAREN, '(', 1, 30),
      new Token(TokenType.IDENT, 'x', 1, 31),
      new Token(TokenType.COMMA, ',', 1, 32),
      new Token(TokenType.IDENT, 'n', 1, 34),
      new Token(TokenType.RPAREN, ')', 1, 35),
      new Token(TokenType.LBRACE, '{', 1, 37),
      new Token(TokenType.IDENT, 'x', 2, 7),
      new Token(TokenType.PLUS, '+', 2, 9),
      new Token(TokenType.IDENT, 'n', 2, 11),
      new Token(TokenType.SEMICOLON, ';', 2, 12),
      new Token(TokenType.RBRACE, '}', 3, 5),
      new Token(TokenType.SEMICOLON, ';', 3, 6),
    ];
    expect(tokens).toEqual(expectedTokens);
  });
  it('lexer function call', () => {
    const source = `variable resultado = suma(2, 3);`;
    const lexer = new Lexer(source);
    const tokens: Token[] = [];
    for (let i = 0; i < 10; i++) {
      tokens.push(lexer.nextToken());
    }
    const expectedTokens: Token[] = [
      new Token(TokenType.LET, 'variable', 1, 1),
      new Token(TokenType.IDENT, 'resultado', 1, 10),
      new Token(TokenType.ASSIGN, '=', 1, 20),
      new Token(TokenType.IDENT, 'suma', 1, 22),
      new Token(TokenType.LPAREN, '(', 1, 26),
      new Token(TokenType.NUM, '2', 1, 27),
      new Token(TokenType.COMMA, ',', 1, 28),
      new Token(TokenType.NUM, '3', 1, 30),
      new Token(TokenType.RPAREN, ')', 1, 31),
      new Token(TokenType.SEMICOLON, ';', 1, 32),
    ];
    expect(tokens).toEqual(expectedTokens);
  });
  it('lexer control statement', () => {
    const source = `si (5 < 10) {
      regresa verdadero;
    } si_no {
      regresa falso;
    }`;

    const lexer = new Lexer(source);
    const tokens: Token[] = [];
    for (let i = 0; i < 17; i++) {
      tokens.push(lexer.nextToken());
    }
    const expectedTokens: Token[] = [
      new Token(TokenType.IF, 'si', 1, 1),
      new Token(TokenType.LPAREN, '(', 1, 4),
      new Token(TokenType.NUM, '5', 1, 5),
      new Token(TokenType.LT, '<', 1, 7),
      new Token(TokenType.NUM, '10', 1, 9),
      new Token(TokenType.RPAREN, ')', 1, 11),
      new Token(TokenType.LBRACE, '{', 1, 13),
      new Token(TokenType.RETURN, 'regresa', 2, 7),
      new Token(TokenType.TRUE, 'verdadero', 2, 15),
      new Token(TokenType.SEMICOLON, ';', 2, 24),
      new Token(TokenType.RBRACE, '}', 3, 5),
      new Token(TokenType.ELSE, 'si_no', 3, 7),
      new Token(TokenType.LBRACE, '{', 3, 13),
      new Token(TokenType.RETURN, 'regresa', 4, 7),
      new Token(TokenType.FALSE, 'falso', 4, 15),
      new Token(TokenType.SEMICOLON, ';', 4, 20),
      new Token(TokenType.RBRACE, '}', 5, 5),
    ];
    expect(tokens).toEqual(expectedTokens);
  });
  it('lexer two character operators', () => {
    const source = `10 == 10;
    10 != 9;`;
    const lexer = new Lexer(source);
    const tokens: Token[] = [];
    for (let i = 0; i < 8; i++) {
      tokens.push(lexer.nextToken());
    }
    const expectedTokens: Token[] = [
      new Token(TokenType.NUM, '10', 1, 1),
      new Token(TokenType.EQ, '==', 1, 4),
      new Token(TokenType.NUM, '10', 1, 7),
      new Token(TokenType.SEMICOLON, ';', 1, 9),
      new Token(TokenType.NUM, '10', 2, 5),
      new Token(TokenType.NEQ, '!=', 2, 8),
      new Token(TokenType.NUM, '9', 2, 11),
      new Token(TokenType.SEMICOLON, ';', 2, 12),
    ];
    expect(tokens).toEqual(expectedTokens);
  });
});
