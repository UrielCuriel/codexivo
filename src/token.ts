export enum TokenType {
  AND = 'AND',
  ASSIGN = 'ASSIGN',
  ASTERISK = 'ASTERISK',
  BANG = 'BANG',
  COMMA = 'COMMA',
  DO = 'DO',
  DOT = 'DOT',
  DOMAIN = 'DOMAIN',
  ELSE = 'ELSE',
  ELSEIF = 'ELSEIF',
  EOF = 'EOF',
  EQ = 'EQ',
  FALSE = 'FALSE',
  FOR = 'FOR',
  FUNCTION = 'FUNCTION',
  GT = 'GT',
  GT_EQ = 'GT_EQ',
  IDENT = 'IDENT',
  IF = 'IF',
  ILLEGAL = 'ILLEGAL',
  LBRACE = 'LBRACE',
  LBRACKET = 'LBRACKET',
  LET = 'LET',
  LPAREN = 'LPAREN',
  LT = 'LT',
  LT_EQ = 'LT_EQ',
  MINUS = 'MINUS',
  MINUS_EQ = 'MINUS_EQ',
  MULT_EQ = 'MULT_EQ',
  DIV_EQ = 'DIV_EQ',
  NEQ = 'NEQ',
  NOT = 'NOT',
  NUM = 'NUM',
  OR = 'OR',
  PLUS = 'PLUS',
  PLUS_EQ = 'PLUS_EQ',
  RBRACE = 'RBRACE',
  RBRACKET = 'RBRACKET',
  RETURN = 'RETURN',
  RPAREN = 'RPAREN',
  SEMICOLON = 'SEMICOLON',
  SLASH = 'SLASH',
  STRING = 'STRING',
  TRUE = 'TRUE',
  WHILE = 'WHILE',
}

export class Token {
  constructor(public type: TokenType, public literal: string, public line?: number, public column?: number) {}

  toString(): string {
    return `Type: ${this.type}, Literal: ${this.literal}`;
  }
}

export const reservedKeywords = [
  'dominio',
  'hacer',
  'hasta_que',
  'pero_si',
  'procedimiento',
  'regresa',
  'si',
  'si_no',
  'falso',
  'variable',
  'verdadero',
  'mientras',
  'no',
  'o',
  'para',
  'y',
];

export const lookupIdentifier = (literal: string): TokenType => {
  const keywords: { [key: string]: TokenType } = {
    dominio: TokenType.DOMAIN,
    hacer: TokenType.DO,
    hasta_que: TokenType.WHILE,
    pero_si: TokenType.ELSEIF,
    procedimiento: TokenType.FUNCTION,
    regresa: TokenType.RETURN,
    si: TokenType.IF,
    si_no: TokenType.ELSE,
    falso: TokenType.FALSE,
    variable: TokenType.LET,
    verdadero: TokenType.TRUE,
    mientras: TokenType.WHILE,
    no: TokenType.NOT,
    o: TokenType.OR,
    para: TokenType.FOR,
    y: TokenType.AND,
  };

  return keywords[literal] || TokenType.IDENT;
};
