import { Lexer } from './lexer';
import {
  BooleanLiteral,
  Call,
  Function,
  Identifier,
  Number,
  LetStatement,
  Program,
  ReturnStatement,
  Statement,
  Expression,
  ExpressionStatement,
  Prefix,
  Infix,
  If,
  Block,
  DoWhile,
  While,
  For,
  StringLiteral,
  ArrayLiteral,
  Index,
} from './ast';
import { reservedKeywords, Token, TokenType } from './token';

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
  [TokenType.PLUS_EQ]: Precedence.SUM,
  [TokenType.MINUS]: Precedence.SUM,
  [TokenType.SLASH]: Precedence.PRODUCT,
  [TokenType.ASTERISK]: Precedence.PRODUCT,
  [TokenType.DO]: Precedence.CALL,
  [TokenType.WHILE]: Precedence.CALL,
  [TokenType.FOR]: Precedence.CALL,
  [TokenType.LBRACKET]: Precedence.CALL,
  [TokenType.LPAREN]: Precedence.CALL,
};

export class Parser {
  private readonly lexer: Lexer;
  private currentToken: Token;
  private peekToken: Token;
  private readonly _errors: string[] = [];
  private readonly infixParseFns: InfixParseFns;
  private readonly prefixParseFns: PrefixParseFns;

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
      throw new Error('currentToken is null');
    }
  }

  private assertPeekToken() {
    if (this.peekToken === null) {
      throw new Error('peekToken is null');
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

  private parseArray(): Expression | null {
    this.assertCurrentToken();
    const elements = this.parseExpressionList();
    const array = new ArrayLiteral(this.currentToken, elements);
    return array;
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

  private parseBoolean(): BooleanLiteral | null {
    this.assertCurrentToken();
    return new BooleanLiteral(this.currentToken, this.currentToken.type === TokenType.TRUE);
  }

  private parseCall(expression: Expression): Call | null {
    this.assertCurrentToken();
    const call = new Call(this.currentToken, expression);
    call.arguments_ = this.parseCallArguments();
    return call;
  }

  private parseCallArguments(): Expression[] {
    const args: Expression[] = [];

    if (this.peekToken.type === TokenType.RPAREN) {
      this.advanceTokens();
      return args;
    }

    this.advanceTokens();
    const firstArg = this.parseExpression(Precedence.LOWEST);
    if (firstArg !== null) {
      args.push(firstArg);
    }

    while (this.peekToken.type === TokenType.COMMA) {
      this.advanceTokens();
      this.advanceTokens();
      const nextArg = this.parseExpression(Precedence.LOWEST);
      if (nextArg !== null) {
        args.push(nextArg);
      }
    }

    if (!this.expectPeek(TokenType.RPAREN)) {
      return [];
    }

    return args;
  }

  private parseDo(): Expression | null {
    this.assertCurrentToken();
    const doExpression = new DoWhile(this.currentToken);

    if (!this.expectPeek(TokenType.LBRACE)) {
      return null;
    }

    // parsear el bloque de código
    doExpression.body = this.parseBlock();
    // parsear la condición
    if (this.peekToken.type === TokenType.WHILE) {
      this.advanceTokens();
      this.advanceTokens();
      const condition = this.parseExpression(Precedence.LOWEST);
      if (condition === null) {
        return null;
      }
      doExpression.condition = condition;
    } else {
      this.expectedTokenError(TokenType.WHILE);
      return null;
    }

    return doExpression;
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

  private parseExpressionList(): Expression[] {
    const list: Expression[] = [];

    this.assertPeekToken();

    if (this.peekToken.type === TokenType.RBRACKET) {
      this.advanceTokens();
      return list;
    }

    this.advanceTokens();
    this.assertCurrentToken();
    const firstExpr = this.parseExpression(Precedence.LOWEST);
    if (firstExpr !== null) {
      list.push(firstExpr);
    }
    while (this.peekToken.type === TokenType.COMMA) {
      this.advanceTokens();
      this.advanceTokens();
      this.assertCurrentToken();
      if (reservedKeywords.includes(this.currentToken.literal)) {
        this._errors.push(`no se puede usar ${this.currentToken.literal} como identificador`);
      }
      const expr = this.parseExpression(Precedence.LOWEST);
      if (expr !== null) {
        list.push(expr);
      }
    }
    if (!this.expectPeek(TokenType.RBRACKET)) {
      return [];
    }
    return list;
  }

  private parseFor(): For | null {
    // para(variable i = 0; i < 10; i = i + 1) { x }
    this.assertCurrentToken();
    const forExpression = new For(this.currentToken);

    if (!this.expectPeek(TokenType.LPAREN)) {
      return null;
    }

    // parsear la inicialización
    if (!this.parseForInitializer(forExpression)) {
      return null;
    }

    // parsear la condición
    if (!this.parseForCondition(forExpression)) {
      return null;
    }

    // parsear el incremento
    if (!this.parseForIncrement(forExpression)) {
      return null;
    }

    // parsear el cuerpo
    return this.parseForBody(forExpression);
  }

  private parseForInitializer(forExpression: For): boolean {
    if (this.peekToken.type === TokenType.LET) {
      this.advanceTokens();
      const init = this.parseLetStatement();
      forExpression.initializer = init || undefined;
    }

    return this.expectToken(TokenType.SEMICOLON);
  }

  private parseForCondition(forExpression: For): boolean {
    this.advanceTokens();

    if (this.peekToken.type !== TokenType.SEMICOLON) {
      const condition = this.parseExpression(Precedence.LOWEST);
      if (condition !== null) {
        forExpression.condition = condition;
      }
    }

    return this.expectPeek(TokenType.SEMICOLON);
  }

  private parseForIncrement(forExpression: For): boolean {
    this.advanceTokens();

    if (this.peekToken.type !== TokenType.RPAREN) {
      const incrementExpr = this.parseExpression(Precedence.LOWEST);
      if (incrementExpr !== null) {
        forExpression.increment = incrementExpr;
      } else {
        forExpression.increment = undefined;
      }
    }

    return this.expectPeek(TokenType.RPAREN);
  }

  private parseForBody(forExpression: For): For | null {
    if (!this.expectPeek(TokenType.LBRACE)) {
      return null;
    }

    this.advanceTokens();
    forExpression.body = this.parseBlock();

    return forExpression;
  }
  private expectToken(tokenType: TokenType): boolean {
    return this.currentToken.type === tokenType;
  }

  private parseFunction(): Expression | null {
    this.assertCurrentToken();
    const functionLiteral = new Function(this.currentToken);

    if (!this.expectPeek(TokenType.LPAREN)) {
      return null;
    }

    functionLiteral.parameters = this.parseFunctionParameters();

    if (!this.expectPeek(TokenType.LBRACE)) {
      return null;
    }

    functionLiteral.body = this.parseBlock();

    return functionLiteral;
  }

  private parseFunctionParameters(): Identifier[] {
    const identifiers: Identifier[] = [];

    this.assertPeekToken();

    if (this.peekToken.type === TokenType.RPAREN) {
      this.advanceTokens();
      return identifiers;
    }

    this.advanceTokens();
    this.assertCurrentToken();
    identifiers.push(new Identifier(this.currentToken, this.currentToken.literal));

    while (this.peekToken.type === TokenType.COMMA) {
      this.advanceTokens();
      this.advanceTokens();
      this.assertCurrentToken();
      if (reservedKeywords.includes(this.currentToken.literal)) {
        this._errors.push(
          `no se puede usar la palabra reservada '${this.currentToken.literal}' como nombre de parámetro`,
        );
      }
      identifiers.push(new Identifier(this.currentToken, this.currentToken.literal));
    }

    if (!this.expectPeek(TokenType.RPAREN)) {
      return [];
    }

    return identifiers;
  }

  private parseExpressionStatement(): ExpressionStatement | null {
    this.assertCurrentToken();
    const expressionStatement = new ExpressionStatement(
      this.currentToken,
      this.parseExpression(Precedence.LOWEST) || undefined,
    );

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
    if (reservedKeywords.includes(this.currentToken.literal)) {
      this._errors.push(`no se puede usar la palabra reservada ${this.currentToken.literal} como identificador`);
      return null;
    }
    return new Identifier(this.currentToken, this.currentToken.literal);
  }

  private parseIf(): Expression | null {
    this.assertCurrentToken();
    const ifExpression = new If(this.currentToken);

    if (!this.expectPeek(TokenType.LPAREN)) {
      return null;
    }

    this.advanceTokens();
    ifExpression.condition = this.parseExpression(Precedence.LOWEST) || undefined;

    if (!this.expectPeek(TokenType.RPAREN)) {
      return null;
    }

    if (!this.expectPeek(TokenType.LBRACE)) {
      return null;
    }

    ifExpression.consequence = this.parseBlock();

    while (this.peekToken.type === TokenType.ELSEIF) {
      this.advanceTokens(); // Avanzar al token "elseif"

      if (!this.expectPeek(TokenType.LPAREN)) {
        return null;
      }

      this.advanceTokens();
      const elseIfExpression = this.parseExpression(Precedence.LOWEST);

      if (!this.expectPeek(TokenType.RPAREN)) {
        return null;
      }

      if (!this.expectPeek(TokenType.LBRACE)) {
        return null;
      }

      const block = this.parseBlock();
      ifExpression.alternative = new If(this.currentToken);
      ifExpression.alternative.condition = elseIfExpression || undefined;
      ifExpression.alternative.consequence = block;
    }

    if (this.peekToken.type === TokenType.ELSE) {
      this.advanceTokens();

      if (!this.expectPeek(TokenType.LBRACE)) {
        return null;
      }

      ifExpression.alternative = this.parseBlock();
    }

    return ifExpression;
  }

  private parseIndexExpression(left: Expression): Expression | null {
    this.assertCurrentToken();
    const indexExpression = new Index(this.currentToken, left);

    if (this.peekToken.type === TokenType.RBRACKET) {
      this._errors.push('no se puede acceder a un array sin índice');
    }

    this.advanceTokens();
    indexExpression.index = this.parseExpression(Precedence.LOWEST) || undefined;

    if (!this.expectPeek(TokenType.RBRACKET)) {
      this._errors.push('se esperaba un corchete de cierre');
    }

    return indexExpression;
  }

  private parseInfix(left: Expression): Expression | null {
    this.assertCurrentToken();
    const infix = new Infix(this.currentToken, left, this.currentToken.literal);

    const precedence = this.currentPrecedence();
    this.advanceTokens();
    infix.right = this.parseExpression(precedence) || undefined;

    return infix;
  }

  private parseNumber(): Expression | null {
    this.assertCurrentToken();
    const numberLiteral = new Number(this.currentToken);

    const value = this.currentToken.literal.includes('.')
      ? parseFloat(this.currentToken.literal)
      : parseInt(this.currentToken.literal);
    
    if (isNaN(value)) {
      this._errors.push(`no se pudo parsear ${this.currentToken.literal} como número`);
      return null;
    }
    
    numberLiteral.value = value;
    return numberLiteral;
  }

  private parseStatement(): Statement | null {
    this.assertCurrentToken();

    switch (this.currentToken.type) {
      case TokenType.LET:
        return this.parseLetStatement();
      case TokenType.RETURN:
        return this.parseReturnStatement();
      default:
        // Verificar si parece una declaración de variable mal formada
        // Buscar patrones como "constante x = " o palabras clave incorrectas seguidas de asignación
        if (this.currentToken.type === TokenType.IDENT) {
          const possibleKeywords = ['constante', 'const', 'let', 'var'];
          if (possibleKeywords.includes(this.currentToken.literal) && this.peekToken.type === TokenType.IDENT) {
            this._errors.push(`'${this.currentToken.literal}' no es una palabra clave válida para declarar variables. ¿Quisiste decir 'variable'?`);
            // Consumir tokens hasta el semicolon para evitar errores en cascada
            this.skipToNextStatement();
            return null;
          }
        }
        return this.parseExpressionStatement();
    }
  }

  private skipToNextStatement(): void {
    while (this.currentToken.type !== TokenType.SEMICOLON && 
           this.currentToken.type !== TokenType.EOF && 
           this.currentToken.type !== TokenType.RBRACE) {
      this.advanceTokens();
    }
  }

  private parseLetStatement(): Statement | null {
    this.assertCurrentToken();
    const letStatement = new LetStatement(this.currentToken);

    if (reservedKeywords.includes(this.peekToken.literal)) {
      this._errors.push(`no se puede usar la palabra reservada '${this.peekToken.literal}' como nombre de variable`);
      return null;
    }

    if (!this.expectPeek(TokenType.IDENT)) {
      return null;
    }

    letStatement.name = new Identifier(this.currentToken, this.currentToken.literal);

    if (!this.expectPeek(TokenType.ASSIGN)) {
      return null;
    }

    this.advanceTokens();

    letStatement.value = this.parseExpression(Precedence.LOWEST) || undefined;

    this.assertPeekToken();

    if (this.peekToken.type === TokenType.SEMICOLON) {
      this.advanceTokens();
    }

    return letStatement;
  }

  private parsePrefix(): Prefix | null {
    this.assertCurrentToken();
    const prefix = new Prefix(this.currentToken, this.currentToken.literal);

    this.advanceTokens();

    prefix.right = this.parseExpression(Precedence.PREFIX) || undefined;

    return prefix;
  }

  private parseReturnStatement(): Statement | null {
    this.assertCurrentToken();
    const returnStatement = new ReturnStatement(this.currentToken);

    this.advanceTokens();

    returnStatement.returnValue = this.parseExpression(Precedence.LOWEST) || undefined;

    this.assertPeekToken();

    if (this.peekToken.type === TokenType.SEMICOLON) {
      this.advanceTokens();
    }

    return returnStatement;
  }

  private parseStringLiteral(): Expression | null {
    this.assertCurrentToken();
    return new StringLiteral(this.currentToken, this.currentToken.literal);
  }
  private parseWhile(): Expression | null {
    this.assertCurrentToken();
    const whileExpression = new While(this.currentToken);

    if (!this.expectPeek(TokenType.LPAREN)) {
      return null;
    }

    this.advanceTokens();
    whileExpression.condition = this.parseExpression(Precedence.LOWEST) || undefined;

    if (!this.expectPeek(TokenType.RPAREN)) {
      return null;
    }

    if (!this.expectPeek(TokenType.LBRACE)) {
      return null;
    }

    whileExpression.body = this.parseBlock();

    return whileExpression;
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
      [TokenType.DO]: this.parseDo.bind(this),
      [TokenType.FALSE]: this.parseBoolean.bind(this),
      [TokenType.FOR]: this.parseFor.bind(this),
      [TokenType.FUNCTION]: this.parseFunction.bind(this),
      [TokenType.IDENT]: this.parseIdentifier.bind(this),
      [TokenType.NUM]: this.parseNumber.bind(this),
      [TokenType.IF]: this.parseIf.bind(this),
      [TokenType.LPAREN]: this.parseGroupedExpression.bind(this),
      [TokenType.LBRACKET]: this.parseArray.bind(this),
      [TokenType.MINUS]: this.parsePrefix.bind(this),
      [TokenType.TRUE]: this.parseBoolean.bind(this),
      [TokenType.STRING]: this.parseStringLiteral.bind(this),
      [TokenType.WHILE]: this.parseWhile.bind(this),
    };
  }

  private registerInfixParseFns(): InfixParseFns {
    return {
      [TokenType.AND]: this.parseInfix.bind(this),
      [TokenType.PLUS]: this.parseInfix.bind(this),
      [TokenType.PLUS_EQ]: this.parseInfix.bind(this),
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
      [TokenType.LPAREN]: this.parseCall.bind(this),
      [TokenType.LBRACKET]: this.parseIndexExpression.bind(this),
    };
  }
}
