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
  CONST = 'CONST',
  DOMAIN = 'DOMAIN',
  FUNCTION = 'FUNCTION',
  RETURN = 'RETURN',
  IF = 'IF',
  ELSEIF = 'ELSEIF',
  ELSE = 'ELSE',
  WHILE = 'WHILE',
  DO = 'DO',
  UNTIL = 'UNTIL',
  FOR = 'FOR',
  FOR_EACH = 'FOR_EACH',
  FROM = 'FROM',
  TO = 'TO',
  STEP = 'STEP',
  IN = 'IN',
  REPEAT = 'REPEAT',
  TIMES = 'TIMES',
  BREAK = 'BREAK',
  CONTINUE = 'CONTINUE',
  TRUE = 'TRUE',
  FALSE = 'FALSE',
  NULL = 'NULL',
  AND = 'AND',
  OR = 'OR',
  NOT = 'NOT',
  MOD = 'MOD',
  DIV = 'DIV',

  // operadores
  ASSIGN = 'ASSIGN',
  PLUS_ASSIGN = 'PLUS_ASSIGN',
  MINUS_ASSIGN = 'MINUS_ASSIGN',
  STAR_ASSIGN = 'STAR_ASSIGN',
  SLASH_ASSIGN = 'SLASH_ASSIGN',
  PERCENT_ASSIGN = 'PERCENT_ASSIGN',
  INCREMENT = 'INCREMENT',
  DECREMENT = 'DECREMENT',
  PLUS = 'PLUS',
  MINUS = 'MINUS',
  STAR = 'STAR',
  SLASH = 'SLASH',
  PERCENT = 'PERCENT',
  CARET = 'CARET',
  BANG = 'BANG',
  EQ = 'EQ',
  NEQ = 'NEQ',
  LT = 'LT',
  GT = 'GT',
  LTE = 'LTE',
  GTE = 'GTE',

  // delimitadores
  COMMA = 'COMMA',
  COLON = 'COLON',
  DOT = 'DOT',
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
  constante: TokenType.CONST,
  dominio: TokenType.DOMAIN,
  procedimiento: TokenType.FUNCTION,
  regresa: TokenType.RETURN,
  si: TokenType.IF,
  pero_si: TokenType.ELSEIF,
  si_no: TokenType.ELSE,
  mientras: TokenType.WHILE,
  hacer: TokenType.DO,
  hasta_que: TokenType.UNTIL,
  para: TokenType.FOR,
  para_cada: TokenType.FOR_EACH,
  desde: TokenType.FROM,
  hasta: TokenType.TO,
  con_paso: TokenType.STEP,
  en: TokenType.IN,
  repetir: TokenType.REPEAT,
  veces: TokenType.TIMES,
  romper: TokenType.BREAK,
  continuar: TokenType.CONTINUE,
  verdadero: TokenType.TRUE,
  falso: TokenType.FALSE,
  nulo: TokenType.NULL,
  y: TokenType.AND,
  o: TokenType.OR,
  no: TokenType.NOT,
  mod: TokenType.MOD,
  div: TokenType.DIV,
  // Las comparaciones en palabras producen el mismo token que su símbolo: el AST no las distingue.
  es_igual_a: TokenType.EQ,
  es_distinto_de: TokenType.NEQ,
  es_menor_que: TokenType.LT,
  es_mayor_que: TokenType.GT,
  es_menor_o_igual_a: TokenType.LTE,
  es_mayor_o_igual_a: TokenType.GTE,
};

export const isKeyword = (word: string): boolean => Object.hasOwn(KEYWORDS, word);

const SYMBOLS: Partial<Record<TokenType, string>> = {
  [TokenType.ASSIGN]: '=',
  [TokenType.PLUS_ASSIGN]: '+=',
  [TokenType.MINUS_ASSIGN]: '-=',
  [TokenType.STAR_ASSIGN]: '*=',
  [TokenType.SLASH_ASSIGN]: '/=',
  [TokenType.PERCENT_ASSIGN]: '%=',
  [TokenType.INCREMENT]: '++',
  [TokenType.DECREMENT]: '--',
  [TokenType.PLUS]: '+',
  [TokenType.MINUS]: '-',
  [TokenType.STAR]: '*',
  [TokenType.SLASH]: '/',
  [TokenType.PERCENT]: '%',
  [TokenType.CARET]: '^',
  [TokenType.BANG]: '!',
  [TokenType.EQ]: '==',
  [TokenType.NEQ]: '!=',
  [TokenType.LT]: '<',
  [TokenType.GT]: '>',
  [TokenType.LTE]: '<=',
  [TokenType.GTE]: '>=',
  [TokenType.COMMA]: ',',
  [TokenType.COLON]: ':',
  [TokenType.DOT]: '.',
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
      // `es_igual_a` y `==` son el mismo token; se nombra como se escribió.
      return isKeyword(token.lexeme) ? `la palabra \`${token.lexeme}\`` : describeTokenType(token.type);
  }
};
