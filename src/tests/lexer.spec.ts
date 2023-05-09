import { assertType, expect, expectTypeOf, it, describe } from "vitest";
import { Lexer } from "../lexer";

import { Token, TokenType } from "../token";

describe("lexer", () => {
  it("lexer illegal Tokens", () => {
    const source = "!¿@";
    const lexer = new Lexer(source);

    const tokens: Token[] = [];
    source.split("").forEach(() => {
      tokens.push(lexer.nextToken());
    });

    const expectedTokens: Token[] = [
      new Token(TokenType.ILLEGAL, "!"),
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
    ];
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
});
