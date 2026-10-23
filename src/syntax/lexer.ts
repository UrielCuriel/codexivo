import { CodexivoError } from '../errors';
import { KEYWORDS, TokenType } from './token';
import type { Position, Span, Token } from './token';

export interface LexResult {
  tokens: Token[];
  errors: CodexivoError[];
}

const LETTER = /[A-Za-z_À-ÖØ-öø-ÿ]/;
const DIGIT = /[0-9]/;
const WHITESPACE = /\s/;

const TWO_CHAR_OPERATORS: Readonly<Record<string, TokenType>> = {
  '==': TokenType.EQ,
  '!=': TokenType.NEQ,
  '<=': TokenType.LTE,
  '>=': TokenType.GTE,
  '+=': TokenType.PLUS_ASSIGN,
  '-=': TokenType.MINUS_ASSIGN,
  '*=': TokenType.STAR_ASSIGN,
  '/=': TokenType.SLASH_ASSIGN,
  '%=': TokenType.PERCENT_ASSIGN,
  '++': TokenType.INCREMENT,
  '--': TokenType.DECREMENT,
};

const ONE_CHAR_OPERATORS: Readonly<Record<string, TokenType>> = {
  '=': TokenType.ASSIGN,
  '+': TokenType.PLUS,
  '-': TokenType.MINUS,
  '*': TokenType.STAR,
  '/': TokenType.SLASH,
  '%': TokenType.PERCENT,
  '^': TokenType.CARET,
  '!': TokenType.BANG,
  '<': TokenType.LT,
  '>': TokenType.GT,
  ',': TokenType.COMMA,
  ':': TokenType.COLON,
  '.': TokenType.DOT,
  ';': TokenType.SEMICOLON,
  '(': TokenType.LPAREN,
  ')': TokenType.RPAREN,
  '{': TokenType.LBRACE,
  '}': TokenType.RBRACE,
  '[': TokenType.LBRACKET,
  ']': TokenType.RBRACKET,
};

const VALUE_ENDS = new Set([
  TokenType.IDENT,
  TokenType.NUMBER,
  TokenType.STRING,
  TokenType.RPAREN,
  TokenType.RBRACKET,
  TokenType.RBRACE,
]);

const ESCAPES: Readonly<Record<string, string>> = {
  n: '\n',
  t: '\t',
  '\\': '\\',
  '"': '"',
  "'": "'",
};

const ILLEGAL_HINTS: Readonly<Record<string, string>> = {
  '&': 'Para el «y» lógico escribe la palabra `y`.',
  '|': 'Para el «o» lógico escribe la palabra `o`.',
  '“': 'Parece una comilla tipográfica; usa comillas rectas `"`.',
  '”': 'Parece una comilla tipográfica; usa comillas rectas `"`.',
  '‘': "Parece una comilla tipográfica; usa comillas rectas `'`.",
  '’': "Parece una comilla tipográfica; usa comillas rectas `'`.",
};

/** Convierte código fuente en tokens. Nunca lanza: los problemas se reportan en `errors`. */
export const tokenize = (source: string): LexResult => {
  const tokens: Token[] = [];
  const errors: CodexivoError[] = [];

  let offset = 0;
  let line = 1;
  let column = 1;

  const position = (): Position => ({ line, column, offset });
  const peek = (ahead = 0): string => source[offset + ahead] ?? '';
  const advance = (): string => {
    const character = source[offset] ?? '';
    offset += 1;
    if (character === '\n') {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
    return character;
  };

  const push = (type: TokenType, start: Position, value?: number | string): Token => {
    const token: Token = { type, lexeme: source.slice(start.offset, offset), span: { start, end: position() } };
    if (value !== undefined) token.value = value;
    tokens.push(token);
    return token;
  };

  const lexicalError = (code: string, message: string, span: Span, hint?: string) => {
    errors.push(new CodexivoError({ kind: 'léxico', code, message, hint, span }));
  };

  while (offset < source.length) {
    const character = peek();

    if (WHITESPACE.test(character)) {
      advance();
      continue;
    }

    const start = position();

    // comentarios
    if (character === '/' && peek(1) === '/') {
      while (offset < source.length && peek() !== '\n') advance();
      continue;
    }
    if (character === '/' && peek(1) === '*') {
      advance();
      advance();
      while (offset < source.length && !(peek() === '*' && peek(1) === '/')) advance();
      if (offset >= source.length) {
        lexicalError(
          'COMENTARIO_SIN_CERRAR',
          'El comentario que empieza aquí no se cerró.',
          {
            start,
            end: { line: start.line, column: start.column + 2, offset: start.offset + 2 },
          },
          'Cierra el comentario con `*/`.',
        );
      } else {
        advance();
        advance();
      }
      continue;
    }

    // números
    // Después de un valor, `.` es acceso a un campo (`d.1` es un error claro, no `d` seguido de `.1`).
    const last = tokens[tokens.length - 1];
    const afterValue = last !== undefined && VALUE_ENDS.has(last.type) && last.span.end.offset === offset;
    if (DIGIT.test(character) || (character === '.' && DIGIT.test(peek(1)) && !afterValue)) {
      // `_` separa grupos de dígitos (`1_000_000`); se revisa que esté bien puesto al final.
      const digits = () => {
        while (DIGIT.test(peek()) || peek() === '_') advance();
      };
      digits();
      if (peek() === '.' && DIGIT.test(peek(1))) {
        advance();
        digits();
      }
      if (LETTER.test(peek()) && peek() !== '_') {
        while (LETTER.test(peek()) || DIGIT.test(peek())) advance();
        const token = push(TokenType.ILLEGAL, start);
        lexicalError(
          'NOMBRE_EMPIEZA_CON_NÚMERO',
          `\`${token.lexeme}\` no es un número ni un nombre válido.`,
          token.span,
          'Los nombres no pueden empezar con un dígito. Si es una multiplicación, escribe el operador: `2 * x`.',
        );
        continue;
      }
      const text = source.slice(start.offset, offset);
      if (/(^|\D)_|_(\D|$)/.test(text)) {
        const token = push(TokenType.ILLEGAL, start);
        lexicalError(
          'SEPARADOR_INVÁLIDO',
          `\`${text}\` no es un número válido.`,
          token.span,
          'El `_` solo puede ir entre dos dígitos para separar grupos, como en `1_000_000`.',
        );
        continue;
      }
      push(TokenType.NUMBER, start, Number(text.replaceAll('_', '')));
      continue;
    }

    // nombres y palabras reservadas
    if (LETTER.test(character)) {
      while (LETTER.test(peek()) || DIGIT.test(peek())) advance();
      const word = source.slice(start.offset, offset);
      push(KEYWORDS[word] ?? TokenType.IDENT, start);
      continue;
    }

    // textos
    if (character === '"' || character === "'") {
      const quote = advance();
      let value = '';
      let closed = false;
      while (offset < source.length && peek() !== '\n') {
        const current = advance();
        if (current === quote) {
          closed = true;
          break;
        }
        if (current === '\\') {
          const escapeStart = { line, column: column - 1, offset: offset - 1 };
          const escaped = advance();
          const replacement = ESCAPES[escaped];
          if (replacement === undefined) {
            lexicalError(
              'ESCAPE_DESCONOCIDO',
              `\`\\${escaped}\` no es una secuencia de escape válida.`,
              { start: escapeStart, end: position() },
              'Las secuencias válidas son `\\n`, `\\t`, `\\\\`, `\\"` y `\\\'`.',
            );
            value += escaped;
          } else {
            value += replacement;
          }
          continue;
        }
        value += current;
      }
      const token = push(TokenType.STRING, start, value);
      if (!closed) {
        lexicalError(
          'TEXTO_SIN_CERRAR',
          'El texto que empieza aquí no se cerró.',
          token.span,
          `Agrega la comilla \`${quote}\` al final. Un texto no puede ocupar varias líneas; usa \`\\n\` para un salto de línea.`,
        );
      }
      continue;
    }

    // operadores y delimitadores
    const pair = character + peek(1);
    const twoChar = TWO_CHAR_OPERATORS[pair];
    if (twoChar) {
      advance();
      advance();
      push(twoChar, start);
      continue;
    }
    const oneChar = ONE_CHAR_OPERATORS[character];
    if (oneChar) {
      advance();
      push(oneChar, start);
      continue;
    }

    advance();
    const token = push(TokenType.ILLEGAL, start);
    lexicalError(
      'CARÁCTER_DESCONOCIDO',
      `Codexivo no reconoce el carácter \`${character}\`.`,
      token.span,
      ILLEGAL_HINTS[character],
    );
  }

  const end = position();
  tokens.push({ type: TokenType.EOF, lexeme: '', span: { start: end, end } });
  return { tokens, errors };
};
