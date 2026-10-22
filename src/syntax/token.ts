export interface Position {
  /** Línea, desde 1. */
  line: number;
  /** Columna, desde 1. */
  column: number;
  /** Desplazamiento en caracteres desde el inicio del código, desde 0. */
  offset: number;
}

/** Rango del código fuente. `end` apunta justo después del último carácter. */
export interface Span {
  start: Position;
  end: Position;
}

export enum TokenType {
  // literales y nombres
  NUMBER = 'NUMBER',
  STRING = 'STRING',
  IDENT = 'IDENT',

  // palabras reservadas
  LET = 'LET',
  FUNCTION = 'FUNCTION',
  RETURN = 'RETURN',
  IF = 'IF',
  ELSEIF = 'ELSEIF',
  ELSE = 'ELSE',
  WHILE = 'WHILE',
  DO = 'DO',
  UNTIL = 'UNTIL',
  FOR = 'FOR',
  TRUE = 'TRUE',
  FALSE = 'FALSE',
  NULL = 'NULL',
  AND = 'AND',
  OR = 'OR',
  NOT = 'NOT',

  // operadores
  ASSIGN = 'ASSIGN',
  PLUS_ASSIGN = 'PLUS_ASSIGN',
  MINUS_ASSIGN = 'MINUS_ASSIGN',
  STAR_ASSIGN = 'STAR_ASSIGN',
  SLASH_ASSIGN = 'SLASH_ASSIGN',
  PLUS = 'PLUS',
  MINUS = 'MINUS',
  STAR = 'STAR',
  SLASH = 'SLASH',
  BANG = 'BANG',
  EQ = 'EQ',
  NEQ = 'NEQ',
  LT = 'LT',
  GT = 'GT',
  LTE = 'LTE',
  GTE = 'GTE',

  // delimitadores
  COMMA = 'COMMA',
  SEMICOLON = 'SEMICOLON',
  LPAREN = 'LPAREN',
  RPAREN = 'RPAREN',
  LBRACE = 'LBRACE',
  RBRACE = 'RBRACE',
  LBRACKET = 'LBRACKET',
  RBRACKET = 'RBRACKET',

  EOF = 'EOF',
  ILLEGAL = 'ILLEGAL',
}

export interface Token {
  type: TokenType;
  /** Texto exacto del código. */
  lexeme: string;
  /** Valor ya interpretado: el número de un NUMBER o el contenido (con escapes resueltos) de un STRING. */
  value?: number | string;
  span: Span;
}

export const KEYWORDS: Readonly<Record<string, TokenType>> = {
  variable: TokenType.LET,
  procedimiento: TokenType.FUNCTION,
  regresa: TokenType.RETURN,
  si: TokenType.IF,
  pero_si: TokenType.ELSEIF,
  si_no: TokenType.ELSE,
  mientras: TokenType.WHILE,
  hacer: TokenType.DO,
  hasta_que: TokenType.UNTIL,
  para: TokenType.FOR,
  verdadero: TokenType.TRUE,
  falso: TokenType.FALSE,
  nulo: TokenType.NULL,
  y: TokenType.AND,
  o: TokenType.OR,
  no: TokenType.NOT,
};

export const isKeyword = (word: string): boolean => Object.hasOwn(KEYWORDS, word);

const SYMBOLS: Partial<Record<TokenType, string>> = {
  [TokenType.ASSIGN]: '=',
  [TokenType.PLUS_ASSIGN]: '+=',
  [TokenType.MINUS_ASSIGN]: '-=',
  [TokenType.STAR_ASSIGN]: '*=',
  [TokenType.SLASH_ASSIGN]: '/=',
  [TokenType.PLUS]: '+',
  [TokenType.MINUS]: '-',
  [TokenType.STAR]: '*',
  [TokenType.SLASH]: '/',
  [TokenType.BANG]: '!',
  [TokenType.EQ]: '==',
  [TokenType.NEQ]: '!=',
  [TokenType.LT]: '<',
  [TokenType.GT]: '>',
  [TokenType.LTE]: '<=',
  [TokenType.GTE]: '>=',
  [TokenType.COMMA]: ',',
  [TokenType.SEMICOLON]: ';',
  [TokenType.LPAREN]: '(',
  [TokenType.RPAREN]: ')',
  [TokenType.LBRACE]: '{',
  [TokenType.RBRACE]: '}',
  [TokenType.LBRACKET]: '[',
  [TokenType.RBRACKET]: ']',
};

const KEYWORD_BY_TYPE = Object.fromEntries(Object.entries(KEYWORDS).map(([word, type]) => [type, word])) as Partial<
  Record<TokenType, string>
>;

/** Cómo nombrar un tipo de token en un mensaje: "`)`", "la palabra `si`", "un número"… */
export const describeTokenType = (type: TokenType): string => {
  const symbol = SYMBOLS[type];
  if (symbol) return `\`${symbol}\``;
  const keyword = KEYWORD_BY_TYPE[type];
  if (keyword) return `la palabra \`${keyword}\``;
  switch (type) {
    case TokenType.NUMBER:
      return 'un número';
    case TokenType.STRING:
      return 'un texto';
    case TokenType.IDENT:
      return 'un nombre';
    case TokenType.EOF:
      return 'el final del programa';
    default:
      return 'un carácter no válido';
  }
};

/** Cómo nombrar un token concreto en un mensaje. */
export const describeToken = (token: Token): string => {
  switch (token.type) {
    case TokenType.NUMBER:
      return `el número \`${token.lexeme}\``;
    case TokenType.STRING:
      return `el texto ${token.lexeme}`;
    case TokenType.IDENT:
      return `el nombre \`${token.lexeme}\``;
    case TokenType.ILLEGAL:
      return `el carácter \`${token.lexeme}\``;
    default:
      return describeTokenType(token.type);
  }
};
