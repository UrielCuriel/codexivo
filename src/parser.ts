import { Lexer } from "./lexer";
import { Boolean, Identifier, Integer, LetStatement, Program, ReturnStatement, Statement, Expression, ExpressionStatement, Prefix, Infix, If, Block } from "./ast";
import { Token, TokenType } from "./token";

export type PrefixParseFn = () => Expression | null;
export type InfixParseFn = (expression: Expression) => Expression | null;
export type PrefixParseFns = { [K in TokenType]?: PrefixParseFn };
export type InfixParseFns = { [K in TokenType]?: InfixParseFn };

export enum Precedence {
  LOWEST = 1,
  EQUALS = 2,
  LESS_GREATER = 3,
  SUM = 4,
  PRODUCT = 5,
  PREFIX = 6,
  CALL = 7,
  OR = 8,
  AND = 9,
}

const precedences: { [K in TokenType]?: Precedence } = {
  [TokenType.AND]: Precedence.AND,
  [TokenType.OR]: Precedence.OR,
  [TokenType.EQ]: Precedence.EQUALS,
  [TokenType.NEQ]: Precedence.EQUALS,
  [TokenType.LT]: Precedence.LESS_GREATER,
  [TokenType.GT]: Precedence.LESS_GREATER,
  [TokenType.LT_EQ]: Precedence.LESS_GREATER,
  [TokenType.GT_EQ]: Precedence.LESS_GREATER,
  [TokenType.PLUS]: Precedence.SUM,
  [TokenType.MINUS]: Precedence.SUM,
  [TokenType.SLASH]: Precedence.PRODUCT,
  [TokenType.ASTERISK]: Precedence.PRODUCT,
};

export class Parser {
  private lexer: Lexer;
  private currentToken: Token;
  private peekToken: Token;
  private readonly _errors: string[] = [];
  private infixParseFns: InfixParseFns;
  private prefixParseFns: PrefixParseFns;

  constructor(lexer: Lexer) {
    this.lexer = lexer;

    this.prefixParseFns = this.registerPrefixParseFns();
    this.infixParseFns = this.registerInfixParseFns();

    this.advanceTokens();
    this.advanceTokens();
  }

  public get errors(): string[] {
    return this._errors;
  }

  parseProgram(): Program {
    const program = new Program([]);

    this.assertCurrentToken();

    while (this.currentToken?.type !== TokenType.EOF) {
      const statement = this.parseStatement();
      if (statement !== null) {
        program.statements.push(statement);
      }
      this.advanceTokens();
    }

    return program;
  }

  private assertCurrentToken() {
    if (this.currentToken === null) {
      throw new Error("currentToken is null");
    }
  }

  private assertPeekToken() {
    if (this.peekToken === null) {
      throw new Error("peekToken is null");
    }
  }

  private advanceTokens(): void {
    this.currentToken = this.peekToken;
    this.peekToken = this.lexer.nextToken();
  }

  private currentPrecedence(): Precedence {
    this.assertCurrentToken();
    const precedence = precedences[this.currentToken.type];
    if (precedence === undefined) {
      return Precedence.LOWEST;
    }
    return precedence;
  }

  private expectPeek(tokenType: TokenType): boolean {
    this.assertPeekToken();
    if (this.peekToken.type === tokenType) {
      this.advanceTokens();
      return true;
    }
    this.expectedTokenError(tokenType);
    return false;
  }

  private expectedTokenError(tokenType: TokenType): void {
    this.assertPeekToken();
    const msg = `se esperaba que el siguiente token fuera ${tokenType} pero se obtuvo ${this.peekToken.type}`;
    this._errors.push(msg);
  }

  private parseBlock(): Block {
    this.assertCurrentToken();
    const block = new Block(this.currentToken, []);

    this.advanceTokens();

    while (this.currentToken.type !== TokenType.RBRACE && this.currentToken.type !== TokenType.EOF) {
      const statement = this.parseStatement();
      if (statement !== null) {
        block.statements.push(statement);
      }
      this.advanceTokens();
    }
    return block;
  }

  private parseBoolean(): Boolean | null {
    this.assertCurrentToken();
    return new Boolean(this.currentToken, this.currentToken.type === TokenType.TRUE);
  }

  private parseExpression(precedence: Precedence): Expression | null {
    this.assertCurrentToken();
    // obtener la función de parseo de prefijos y si no existe, agregar un error a la lista de errores
    const prefixParseFn = this.prefixParseFns[this.currentToken.type];
    let leftExpression = prefixParseFn?.call(this);

    this.assertPeekToken();
    while (this.peekToken.type !== TokenType.SEMICOLON && precedence < this.peekPrecedence()) {
      const infixParseFn = this.infixParseFns[this.peekToken.type];
      if (infixParseFn === undefined) {
        return leftExpression;
      }
      this.advanceTokens();
      leftExpression = infixParseFn.call(this, leftExpression);
    }

    if (prefixParseFn === undefined && leftExpression === undefined) {
      this._errors.push(`no se encontró ninguna función de parseo para el token ${this.currentToken.literal}`);
    }

    return leftExpression;
  }

  private parseExpressionStatement(): ExpressionStatement | null {
    this.assertCurrentToken();
    const expressionStatement = new ExpressionStatement(this.currentToken, this.parseExpression(Precedence.LOWEST));

    this.assertPeekToken();

    if (this.peekToken.type === TokenType.SEMICOLON) {
      this.advanceTokens();
    }

    return expressionStatement;
  }

  private parseGroupedExpression(): Expression | null {
    this.advanceTokens();

    const expression = this.parseExpression(Precedence.LOWEST);

    if (!this.expectPeek(TokenType.RPAREN)) {
      return null;
    }

    return expression;
  }

  private parseIdentifier(): Identifier | null {
    this.assertCurrentToken();
    return new Identifier(this.currentToken, this.currentToken.literal);
  }

  private parseIf(): Expression | null {
    this.assertCurrentToken();
    const ifExpression = new If(this.currentToken);

    if (!this.expectPeek(TokenType.LPAREN)) {
      return null;
    }

    this.advanceTokens();
    ifExpression.condition = this.parseExpression(Precedence.LOWEST);

    if (!this.expectPeek(TokenType.RPAREN)) {
      return null;
    }

    if (!this.expectPeek(TokenType.LBRACE)) {
      return null;
    }

    ifExpression.consequence = this.parseBlock();

    if (this.peekToken.type === TokenType.ELSE) {
      this.advanceTokens();

      if (!this.expectPeek(TokenType.LBRACE)) {
        return null;
      }

      ifExpression.alternative = this.parseBlock();
    }

    return ifExpression;
  }

  private parseInfix(left: Expression): Expression | null {
    this.assertCurrentToken();
    const infix = new Infix(this.currentToken, left, this.currentToken.literal);

    const precedence = this.currentPrecedence();
    this.advanceTokens();
    infix.right = this.parseExpression(precedence);

    return infix;
  }

  private parseInteger(): Expression | null {
    this.assertCurrentToken();
    const integer = new Integer(this.currentToken);

    try {
      integer.value = parseInt(this.currentToken.literal);
    } catch (error) {
      this._errors.push(`no se pudo parsear ${this.currentToken.literal} como entero`);
      return null;
    }
    return integer;
  }

  private parseStatement(): Statement | null {
    this.assertCurrentToken();

    switch (this.currentToken.type) {
      case TokenType.LET:
        return this.parseLetStatement();
      case TokenType.RETURN:
        return this.parseReturnStatement();
      default:
        return this.parseExpressionStatement();
    }
  }

  private parseLetStatement(): Statement | null {
    this.assertCurrentToken();
    const letStatement = new LetStatement(this.currentToken);
    if (!this.expectPeek(TokenType.IDENT)) {
      return null;
    }

    letStatement.name = new Identifier(this.currentToken, this.currentToken.literal);

    if (!this.expectPeek(TokenType.ASSIGN)) {
      return null;
    }

    //TODO: terminar cuando sepamos como parsear expresiones

    while (this.currentToken.type != TokenType.SEMICOLON) {
      this.advanceTokens();
    }

    return letStatement;
  }

  private parsePrefix(): Prefix | null {
    this.assertCurrentToken();
    const prefix = new Prefix(this.currentToken, this.currentToken.literal);

    this.advanceTokens();

    prefix.right = this.parseExpression(Precedence.PREFIX);

    return prefix;
  }

  private parseReturnStatement(): Statement | null {
    this.assertCurrentToken();
    const returnStatement = new ReturnStatement(this.currentToken);

    this.advanceTokens();

    //TODO: terminar cuando sepamos como parsear expresiones

    while (this.currentToken.type != TokenType.SEMICOLON) {
      this.advanceTokens();
    }

    return returnStatement;
  }

  private peekPrecedence(): Precedence {
    this.assertPeekToken();
    const precedence = precedences[this.peekToken.type];
    if (precedence === undefined) {
      return Precedence.LOWEST;
    }
    return precedence;
  }

  private registerPrefixParseFns(): PrefixParseFns {
    return {
      [TokenType.BANG]: this.parsePrefix.bind(this),
      [TokenType.FALSE]: this.parseBoolean.bind(this),
      [TokenType.IDENT]: this.parseIdentifier.bind(this),
      [TokenType.INT]: this.parseInteger.bind(this),
      [TokenType.IF]: this.parseIf.bind(this),
      [TokenType.LPAREN]: this.parseGroupedExpression.bind(this),
      [TokenType.MINUS]: this.parsePrefix.bind(this),
      [TokenType.TRUE]: this.parseBoolean.bind(this),
    };
  }

  private registerInfixParseFns(): InfixParseFns {
    return {
      [TokenType.AND]: this.parseInfix.bind(this),
      [TokenType.PLUS]: this.parseInfix.bind(this),
      [TokenType.MINUS]: this.parseInfix.bind(this),
      [TokenType.SLASH]: this.parseInfix.bind(this),
      [TokenType.ASTERISK]: this.parseInfix.bind(this),
      [TokenType.EQ]: this.parseInfix.bind(this),
      [TokenType.NEQ]: this.parseInfix.bind(this),
      [TokenType.OR]: this.parseInfix.bind(this),
      [TokenType.LT]: this.parseInfix.bind(this),
      [TokenType.GT]: this.parseInfix.bind(this),
      [TokenType.LT_EQ]: this.parseInfix.bind(this),
      [TokenType.GT_EQ]: this.parseInfix.bind(this),
    };
  }
}
