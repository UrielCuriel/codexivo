export enum TokenType {
  ASSIGN = "ASSIGN",
  ASTERISK = "ASTERISK",
  COMMA = "COMMA",
  EOF = "EOF",
  FUNCTION = "FUNCTION",
  GT = "GT",
  IDENT = "IDENT",
  ILLEGAL = "ILLEGAL",
  INT = "INT",
  LBRACE = "LBRACE",
  LET = "LET",
  LPAREN = "LPAREN",
  LT = "LT",
  MINUS = "MINUS",
  PLUS = "PLUS",
  RBRACE = "RBRACE",
  RPAREN = "RPAREN",
  SEMICOLON = "SEMICOLON",
  SLASH = "SLASH",
}

export class Token {
  type: TokenType;
  literal: string;

  constructor(type: TokenType, literal: string) {
    this.type = type;
    this.literal = literal;
  }

  toString(): string {
    return `Type: ${this.type}, Literal: ${this.literal}`;
  }
}

export const lookupIdentifier = (literal: string): TokenType => {
  const keywords: { [key: string]: TokenType } = {
    variable: TokenType.LET,
  };

  return keywords[literal] || TokenType.IDENT;
};
