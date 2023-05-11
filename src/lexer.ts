import { lookupIdentifier, Token, TokenType } from './token';

export class Lexer {
  private source: string;
  private character: string;
  private readPosition: number = 0;
  private position: number = 0;

  constructor(source: string) {
    this.source = source;
    this.character = '';
    this.readPosition = 0;
    this.position = 0;

    this.readCharacter();
  }

  public nextToken(): Token {
    let token: Token;
    this.skipWhitespace();

    const tokenPatterns = {
      '=': [TokenType.ASSIGN, ['=', TokenType.EQ]],
      '+': [TokenType.PLUS],
      '-': [TokenType.MINUS],
      '*': [TokenType.ASTERISK],
      '/': [TokenType.SLASH],
      '<': [TokenType.LT, ['=', TokenType.LT_EQ]],
      '>': [TokenType.GT, ['=', TokenType.GT_EQ]],
      '!': [TokenType.BANG, ['=', TokenType.NEQ]],
      ',': [TokenType.COMMA],
      ';': [TokenType.SEMICOLON],
      '(': [TokenType.LPAREN],
      ')': [TokenType.RPAREN],
      '{': [TokenType.LBRACE],
      '}': [TokenType.RBRACE],
      '': [TokenType.EOF],
    };

    if (tokenPatterns[this.character]) {
      if (tokenPatterns[this.character].length === 2) {
        if (this.peekCharacter() === tokenPatterns[this.character][1][0]) {
          token = this.makeTwoCharacterToken(tokenPatterns[this.character][1][1]);
        } else {
          token = new Token(tokenPatterns[this.character][0], this.character);
        }
      } else {
        token = new Token(tokenPatterns[this.character][0], this.character);
      }
    } else if (this.isLetter(this.character)) {
      const literal = this.readIdentifier();
      const type = lookupIdentifier(literal) || TokenType.IDENT;
      token = new Token(type, literal);
    } else if (this.isNumber(this.character)) {
      const literal = this.readNumber();
      token = new Token(TokenType.INT, literal);
    } else {
      token = new Token(TokenType.ILLEGAL, this.character);
    }

    this.readCharacter();
    return token;
  }

  private isLetter(character: string): boolean {
    // regex for a single letter character and underscore character and accented characters
    return /^[a-zA-Z_áéíóúÁÉÍÓÚñÑ]$/.test(character);
  }

  private isNumber(character: string): boolean {
    return /^\d$/.test(character);
  }

  private makeTwoCharacterToken(type: TokenType): Token {
    const initialPosition = this.position;
    this.readCharacter();
    const literal = this.source.substring(initialPosition, this.position + 1);
    return new Token(type, literal);
  }

  private readCharacter(): void {
    if (this.readPosition >= this.source.length) this.character = '';
    else {
      this.character = this.source[this.readPosition];
      this.readPosition += 1;
    }
    this.position = this.readPosition - 1;
  }

  private readIdentifier(): string {
    const initialPosition = this.position;
    while (this.isLetter(this.character) || (this.position > initialPosition && this.isNumber(this.character)))
      this.readCharacter();
    const identifier = this.source.substring(initialPosition, this.position);
    this.position -= 1;
    this.readPosition -= 1;
    return identifier;
  }

  private readNumber(): string {
    const initialPosition = this.position;
    while (this.isNumber(this.character)) this.readCharacter();
    const number = this.source.substring(initialPosition, this.position);
    this.position -= 1;
    this.readPosition -= 1;
    return number;
  }

  private peekCharacter(): string {
    if (this.readPosition >= this.source.length) return '';
    return this.source[this.readPosition];
  }

  private skipWhitespace(): void {
    while (/^\s$/.test(this.character)) this.readCharacter();
  }
}
