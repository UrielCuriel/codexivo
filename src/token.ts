export enum TokenType {
  AND,
  ASSIGN,
  ASTERISK,
  BANG,
  COMMA,
  ELSE,
  EOF,
  EQ,
  FALSE,
  FUNCTION,
  GT,
  GT_EQ,
  IDENT,
  IF,
  ILLEGAL,
  INT,
  LBRACE,
  LET,
  LPAREN,
  LT,
  LT_EQ,
  MINUS,
  NEQ,
  OR,
  PLUS,
  RBRACE,
  RETURN,
  RPAREN,
  SEMICOLON,
  SLASH,
  TRUE,
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
