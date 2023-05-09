import { lookupIdentifier, Token, TokenType } from "./token";

export class Lexer {
  private source: string;
  private character: string;
  private readPosition: number = 0;
  private position: number = 0;

  constructor(source: string) {
    this.source = source;
    this.character = "";
    this.readPosition = 0;
    this.position = 0;

    this.readCharacter();
  }

  public nextToken(): Token {
    let token: Token;
    this.skipWhitespace();
    if (/^=$/.test(this.character))
      token = new Token(TokenType.ASSIGN, this.character);
    else if (/^\+$/.test(this.character))
      token = new Token(TokenType.PLUS, this.character);
    else if (/^\-$/.test(this.character))
      token = new Token(TokenType.MINUS, this.character);
    else if (/^\*$/.test(this.character))
      token = new Token(TokenType.ASTERISK, this.character);
    else if (/^\/$/.test(this.character))
      token = new Token(TokenType.SLASH, this.character);
    else if (/^<$/.test(this.character))
      token = new Token(TokenType.LT, this.character);
    else if (/^>$/.test(this.character))
      token = new Token(TokenType.GT, this.character);
    else if (/^,$/.test(this.character))
      token = new Token(TokenType.COMMA, this.character);
    else if (/^;$/.test(this.character))
      token = new Token(TokenType.SEMICOLON, this.character);
    else if (/^\($/.test(this.character))
      token = new Token(TokenType.LPAREN, this.character);
    else if (/^\)$/.test(this.character))
      token = new Token(TokenType.RPAREN, this.character);
    else if (/^\{$/.test(this.character))
      token = new Token(TokenType.LBRACE, this.character);
    else if (/^\}$/.test(this.character))
      token = new Token(TokenType.RBRACE, this.character);
    else if (/^$/.test(this.character))
      token = new Token(TokenType.EOF, this.character);
    else if (this.isLetter(this.character)) {
      const literal = this.readIdentifier();
      const type = lookupIdentifier(literal);
      token = new Token(type, literal);
    } else if (this.isNumber(this.character)) {
      const literal = this.readNumber();
      token = new Token(TokenType.INT, literal);
    } else token = new Token(TokenType.ILLEGAL, this.character);
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

  private readCharacter(): void {
    if (this.readPosition >= this.source.length) this.character = "";
    else {
      this.character = this.source[this.readPosition];
      this.readPosition += 1;
    }
    this.position = this.readPosition - 1;
  }

  private readIdentifier(): string {
    const initialPosition = this.position;
    while (this.isLetter(this.character)) this.readCharacter();
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

  private skipWhitespace(): void {
    while (/^\s$/.test(this.character)) this.readCharacter();
  }
}
