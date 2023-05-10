export enum TokenType {
  AND = "AND",
  ASSIGN = "ASSIGN",
  ASTERISK = "ASTERISK",
  BANG = "BANG",
  COMMA = "COMMA",
  ELSE = "ELSE",
  EOF = "EOF",
  EQ = "EQ",
  FALSE = "FALSE",
  FUNCTION = "FUNCTION",
  GT = "GT",
  GT_EQ = "GT_EQ",
  IDENT = "IDENT",
  IF = "IF",
  ILLEGAL = "ILLEGAL",
  INT = "INT",
  LBRACE = "LBRACE",
  LET = "LET",
  LPAREN = "LPAREN",
  LT = "LT",
  LT_EQ = "LT_EQ",
  MINUS = "MINUS",
  NEQ = "NEQ",
  OR = "OR",
  PLUS = "PLUS",
  RBRACE = "RBRACE",
  RETURN = "RETURN",
  RPAREN = "RPAREN",
  SEMICOLON = "SEMICOLON",
  SLASH = "SLASH",
  TRUE = "TRUE",
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
    falso: TokenType.FALSE,
    procedimiento: TokenType.FUNCTION,
    regresa: TokenType.RETURN,
    si: TokenType.IF,
    sino: TokenType.ELSE,
    variable: TokenType.LET,
    verdadero: TokenType.TRUE,
  };

  return keywords[literal] || TokenType.IDENT;
};
