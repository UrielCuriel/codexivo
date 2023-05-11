import { assertType, expect, expectTypeOf, it, describe } from "vitest";
import { Lexer } from "../lexer";

import { Token, TokenType } from "../token";

describe("lexer", () => {
  it("lexer illegal Tokens", () => {
    const source = "¡¿@";
    const lexer = new Lexer(source);

    const tokens: Token[] = [];
    source.split("").forEach(() => {
      tokens.push(lexer.nextToken());
    });

    const expectedTokens: Token[] = [
      new Token(TokenType.ILLEGAL, "¡"),
      new Token(TokenType.ILLEGAL, "¿"),
      new Token(TokenType.ILLEGAL, "@"),
    ];

    expect(tokens).toEqual(expectedTokens);
  });

  it("lexer One Character Operators", () => {
    const source = "=+-*/<>!";
    const lexer = new Lexer(source);
    const tokens: Token[] = [];
    source.split("").forEach(() => {
      tokens.push(lexer.nextToken());
    });
    const expectedTokens: Token[] = [
      new Token(TokenType.ASSIGN, "="),
      new Token(TokenType.PLUS, "+"),
      new Token(TokenType.MINUS, "-"),
      new Token(TokenType.ASTERISK, "*"),
      new Token(TokenType.SLASH, "/"),
      new Token(TokenType.LT, "<"),
      new Token(TokenType.GT, ">"),
      new Token(TokenType.BANG, "!"),
    ];
    expect(tokens).toEqual(expectedTokens);
  });
  it("lexer EOF Token", () => {
    const source = "=";
    const lexer = new Lexer(source);
    const tokens: Token[] = [];

    for (let i = 0; i < source.length + 1; i++) {
      tokens.push(lexer.nextToken());
    }
    const expectedTokens: Token[] = [
      new Token(TokenType.ASSIGN, "="),
      new Token(TokenType.EOF, ""),
    ];
    expect(tokens).toEqual(expectedTokens);
  });

  it("lexer delimiters", () => {
    const source = "(){},;";
    const lexer = new Lexer(source);
    const tokens: Token[] = [];
    source.split("").forEach(() => {
      tokens.push(lexer.nextToken());
    });
    const expectedTokens: Token[] = [
      new Token(TokenType.LPAREN, "("),
      new Token(TokenType.RPAREN, ")"),
      new Token(TokenType.LBRACE, "{"),
      new Token(TokenType.RBRACE, "}"),
      new Token(TokenType.COMMA, ","),
      new Token(TokenType.SEMICOLON, ";"),
    ];
    expect(tokens).toEqual(expectedTokens);
  });

  it("lexer assignment", () => {
    const source = `variable cinco = 55;`;
    const lexer = new Lexer(source);
    const tokens: Token[] = [];
    for (let i = 0; i < 5; i++) {
      tokens.push(lexer.nextToken());
    }
    const expectedTokens: Token[] = [
      new Token(TokenType.LET, "variable"),
      new Token(TokenType.IDENT, "cinco"),
      new Token(TokenType.ASSIGN, "="),
      new Token(TokenType.INT, "55"),
      new Token(TokenType.SEMICOLON, ";"),
    ];
    expect(tokens).toEqual(expectedTokens);
  });
  it("lexer declaration", () => {
    const source = `variable cinco;`;
    const lexer = new Lexer(source);
    const tokens: Token[] = [];
    for (let i = 0; i < 3; i++) {
      tokens.push(lexer.nextToken());
    }
    const expectedTokens: Token[] = [
      new Token(TokenType.LET, "variable"),
      new Token(TokenType.IDENT, "cinco"),
      new Token(TokenType.SEMICOLON, ";"),
    ];
    expect(tokens).toEqual(expectedTokens);
  });
  it("lexer function declaration", () => {
    const source = `variable suma = procedimiento(x, n) { 
      x + n; 
    };`;
    const lexer = new Lexer(source);
    const tokens: Token[] = [];
    for (let i = 0; i < 16; i++) {
      tokens.push(lexer.nextToken());
    }

    const expectedTokens: Token[] = [
      new Token(TokenType.LET, "variable"),
      new Token(TokenType.IDENT, "suma"),
      new Token(TokenType.ASSIGN, "="),
      new Token(TokenType.FUNCTION, "procedimiento"),
      new Token(TokenType.LPAREN, "("),
      new Token(TokenType.IDENT, "x"),
      new Token(TokenType.COMMA, ","),
      new Token(TokenType.IDENT, "n"),
      new Token(TokenType.RPAREN, ")"),
      new Token(TokenType.LBRACE, "{"),
      new Token(TokenType.IDENT, "x"),
      new Token(TokenType.PLUS, "+"),
      new Token(TokenType.IDENT, "n"),
      new Token(TokenType.SEMICOLON, ";"),
      new Token(TokenType.RBRACE, "}"),
      new Token(TokenType.SEMICOLON, ";"),
    ];
    expect(tokens).toEqual(expectedTokens);
  });
  it("lexer function call", () => {
    const source = `variable resultado = suma(2, 3);`;
    const lexer = new Lexer(source);
    const tokens: Token[] = [];
    for (let i = 0; i < 10; i++) {
      tokens.push(lexer.nextToken());
    }
    const expectedTokens: Token[] = [
      new Token(TokenType.LET, "variable"),
      new Token(TokenType.IDENT, "resultado"),
      new Token(TokenType.ASSIGN, "="),
      new Token(TokenType.IDENT, "suma"),
      new Token(TokenType.LPAREN, "("),
      new Token(TokenType.INT, "2"),
      new Token(TokenType.COMMA, ","),
      new Token(TokenType.INT, "3"),
      new Token(TokenType.RPAREN, ")"),
      new Token(TokenType.SEMICOLON, ";"),
    ];
    expect(tokens).toEqual(expectedTokens);
  });
  it("lexer control statement", () => {
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
      new Token(TokenType.IF, "si"),
      new Token(TokenType.LPAREN, "("),
      new Token(TokenType.INT, "5"),
      new Token(TokenType.LT, "<"),
      new Token(TokenType.INT, "10"),
      new Token(TokenType.RPAREN, ")"),
      new Token(TokenType.LBRACE, "{"),
      new Token(TokenType.RETURN, "regresa"),
      new Token(TokenType.TRUE, "verdadero"),
      new Token(TokenType.SEMICOLON, ";"),
      new Token(TokenType.RBRACE, "}"),
      new Token(TokenType.ELSE, "si_no"),
      new Token(TokenType.LBRACE, "{"),
      new Token(TokenType.RETURN, "regresa"),
      new Token(TokenType.FALSE, "falso"),
      new Token(TokenType.SEMICOLON, ";"),
      new Token(TokenType.RBRACE, "}"),
    ];
    expect(tokens).toEqual(expectedTokens);
  });
  it("lexer two character operators", () => {
    const source = `
                    10 == 10;
                    10 != 9;
                    `;
    const lexer = new Lexer(source);
    const tokens: Token[] = [];
    for (let i = 0; i < 8; i++) {
      tokens.push(lexer.nextToken());
    }
    const expectedTokens: Token[] = [
      new Token(TokenType.INT, "10"),
      new Token(TokenType.EQ, "=="),
      new Token(TokenType.INT, "10"),
      new Token(TokenType.SEMICOLON, ";"),
      new Token(TokenType.INT, "10"),
      new Token(TokenType.NEQ, "!="),
      new Token(TokenType.INT, "9"),
      new Token(TokenType.SEMICOLON, ";"),
    ];
    expect(tokens).toEqual(expectedTokens);
  });
});
