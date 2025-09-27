import { lookupIdentifier, Token, TokenType } from './token';

export class Lexer {
  private source: string;
  private character: string;
  private readPosition: number = 0;
  private position: number = 0;
  private line: number = 1;
  private column: number = 0;

  constructor(source: string) {
    this.source = source;
    this.character = '';
    this.readPosition = 0;
    this.position = 0;
    this.line = 1;
    this.column = 0;

    this.readCharacter();
  }

  public nextToken(): Token {
    let token: Token;
    this.skipWhitespace();

    const tokenPatterns = {
      '=': [TokenType.ASSIGN, ['=', TokenType.EQ]],
      '+': [TokenType.PLUS, ['=', TokenType.PLUS_EQ]],
      '-': [TokenType.MINUS, ['=', TokenType.MINUS_EQ]],
      '*': [TokenType.ASTERISK, ['=', TokenType.MULT_EQ]],
      '/': [TokenType.SLASH, ['=', TokenType.DIV_EQ]],
      '<': [TokenType.LT, ['=', TokenType.LT_EQ]],
      '>': [TokenType.GT, ['=', TokenType.GT_EQ]],
      '!': [TokenType.BANG, ['=', TokenType.NEQ]],
      ',': [TokenType.COMMA],
      ':': [TokenType.COLON],
      '.': [TokenType.DOT],
      ';': [TokenType.SEMICOLON],
      '(': [TokenType.LPAREN],
      ')': [TokenType.RPAREN],
      '{': [TokenType.LBRACE],
      '}': [TokenType.RBRACE],
      '[': [TokenType.LBRACKET],
      ']': [TokenType.RBRACKET],
      '': [TokenType.EOF],
    };

    if (tokenPatterns[this.character]) {
      // Special case: if we have a dot and the next character is a digit, treat it as a number
      if (this.character === '.' && /^\d$/.test(this.peekCharacter())) {
        const [literal, initialColumn] = this.readNumber();
        token = new Token(TokenType.NUM, literal, this.line, initialColumn);
      } else if (tokenPatterns[this.character].length === 2) {
        if (this.peekCharacter() === tokenPatterns[this.character][1][0]) {
          token = this.makeTwoCharacterToken(tokenPatterns[this.character][1][1]);
        } else {
          token = new Token(tokenPatterns[this.character][0], this.character, this.line, this.column);
        }
      } else {
        token = new Token(tokenPatterns[this.character][0], this.character, this.line, this.column);
      }
    } else if (this.isLetter(this.character)) {
      const [literal, initialColumn] = this.readIdentifier();
      const type = lookupIdentifier(literal) || TokenType.IDENT;
      token = new Token(type, literal, this.line, initialColumn);
    } else if (this.isNumber(this.character)) {
      const [literal, initialColumn] = this.readNumber();
      token = new Token(TokenType.NUM, literal, this.line, initialColumn);
    } else if (/^\"|'/.test(this.character)) {
      const [literal, initialColumn] = this.readString();
      token = new Token(TokenType.STRING, literal, this.line, initialColumn);
    } else {
      token = new Token(TokenType.ILLEGAL, this.character, this.line, this.column);
    }

    this.readCharacter();
    return token;
  }

  private isLetter(character: string): boolean {
    // regex for a single letter character and underscore character and accented characters
    return /^[a-zA-Z_áéíóúÁÉÍÓÚñÑ]$/.test(character);
  }

  private isNumber(character: string): boolean {
    return /^[\d.]$/.test(character);
  }

  private isInteger(character: string): boolean {
    return /^\d$/.test(character);
  }

  private makeTwoCharacterToken(type: TokenType): Token {
    const initialPosition = this.position;
    const initialColumn = this.column;
    this.readCharacter();
    const literal = this.source.substring(initialPosition, this.position + 1);
    return new Token(type, literal, this.line, initialColumn);
  }

  private readCharacter(): void {
    if (this.readPosition >= this.source.length) {
      this.character = '';
      this.column += 1;
      this.position = this.readPosition;
    } else {
      if (this.character === '\n') {
        this.line += 1;
        this.column = 1;
      } else {
        if (this.character === '\t') {
          this.column += 3;
        } else this.column += 1;
      }
      this.position = this.readPosition;
      this.character = this.source[this.readPosition];
      this.readPosition += 1;
    }
  }

  private readIdentifier(): [string, number] {
    const initialPosition = this.position;
    const initialColumn = this.column;
    while (this.isLetter(this.character) || (this.position > initialPosition && this.isInteger(this.character)))
      this.readCharacter();
    const diff = this.position - initialPosition;

    const identifier = this.source.substring(initialPosition, diff > 0 ? this.position : this.position + 1);
    if (this.character !== '') {
      this.readPosition -= 1;
      this.column -= 1;
    }

    return [identifier, initialColumn];
  }

  private readNumber(): [string, number] {
    const initialPosition = this.position;
    const initialColumn = this.column;
    while (this.isNumber(this.character)) this.readCharacter();
    const diff = this.position - initialPosition;
    const number = this.source.substring(initialPosition, diff > 0 ? this.position : this.position + 1);
    if (this.character !== '') {
      this.readPosition -= 1;
      this.column -= 1;
    }
    return [number, initialColumn];
  }

  private readString(): [string, number] {
    const initialPosition = this.position;
    const initialColumn = this.column;
    const quote = this.character;
    this.readCharacter();
    while (this.character !== quote && !this.isEOF()) this.readCharacter();
    const diff = this.position - initialPosition;
    const string = this.source.substring(initialPosition + 1, diff > 0 ? this.position : this.position + 1);
    this.readCharacter();
    if (this.character !== '') {
      this.readPosition -= 1;
      this.column -= 1;
    }
    return [string, initialColumn];
  }

  private isEOF(): boolean {
    return this.readPosition >= this.source.length;
  }

  private peekCharacter(): string {
    if (this.readPosition >= this.source.length) return '';
    return this.source[this.readPosition];
  }

  private skipWhitespace(): void {
    while (/^\s$/.test(this.character)) this.readCharacter();
  }
}
