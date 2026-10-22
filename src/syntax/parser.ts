import { CodexivoError } from '../errors';
import type * as ast from './ast';
import { tokenize } from './lexer';
import { describeToken, describeTokenType, TokenType } from './token';
import type { Position, Span, Token } from './token';

export interface ParseResult {
  program: ast.Program;
  tokens: Token[];
  /** Errores léxicos y sintácticos, en el orden en que aparecen en el código. */
  errors: CodexivoError[];
}

/** Analiza el código y construye el AST. Nunca lanza: los problemas se reportan en `errors`. */
export const parse = (source: string): ParseResult => {
  const { tokens, errors: lexicalErrors } = tokenize(source);
  const parser = new Parser(tokens);
  const program = parser.parseProgram();
  const errors = [...lexicalErrors, ...parser.errors].sort(
    (a, b) => (a.span?.start.offset ?? 0) - (b.span?.start.offset ?? 0),
  );
  return { program, tokens, errors };
};

enum Precedence {
  LOWEST,
  OR,
  AND,
  NOT,
  COMPARE,
  SUM,
  PRODUCT,
  UNARY,
  CALL,
}

const INFIX_PRECEDENCE: Partial<Record<TokenType, Precedence>> = {
  [TokenType.OR]: Precedence.OR,
  [TokenType.AND]: Precedence.AND,
  [TokenType.EQ]: Precedence.COMPARE,
  [TokenType.NEQ]: Precedence.COMPARE,
  [TokenType.LT]: Precedence.COMPARE,
  [TokenType.GT]: Precedence.COMPARE,
  [TokenType.LTE]: Precedence.COMPARE,
  [TokenType.GTE]: Precedence.COMPARE,
  [TokenType.PLUS]: Precedence.SUM,
  [TokenType.MINUS]: Precedence.SUM,
  [TokenType.STAR]: Precedence.PRODUCT,
  [TokenType.SLASH]: Precedence.PRODUCT,
  [TokenType.LPAREN]: Precedence.CALL,
  [TokenType.LBRACKET]: Precedence.CALL,
};

const BINARY_OPERATORS: Partial<Record<TokenType, ast.BinaryOperator>> = {
  [TokenType.PLUS]: '+',
  [TokenType.MINUS]: '-',
  [TokenType.STAR]: '*',
  [TokenType.SLASH]: '/',
  [TokenType.EQ]: '==',
  [TokenType.NEQ]: '!=',
  [TokenType.LT]: '<',
  [TokenType.GT]: '>',
  [TokenType.LTE]: '<=',
  [TokenType.GTE]: '>=',
};

const ASSIGNMENT_OPERATORS: Partial<Record<TokenType, ast.AssignmentOperator>> = {
  [TokenType.ASSIGN]: '=',
  [TokenType.PLUS_ASSIGN]: '+=',
  [TokenType.MINUS_ASSIGN]: '-=',
  [TokenType.STAR_ASSIGN]: '*=',
  [TokenType.SLASH_ASSIGN]: '/=',
};

const STATEMENT_KEYWORDS = new Set([
  TokenType.LET,
  TokenType.RETURN,
  TokenType.IF,
  TokenType.WHILE,
  TokenType.DO,
  TokenType.FOR,
]);

const KEYWORD_LIKE_TYPOS: Readonly<Record<string, string>> = {
  sino: 'En Codexivo se escribe `si_no`, con guion bajo.',
  pero: 'En Codexivo se escribe `pero_si`, con guion bajo.',
  hasta: 'En Codexivo se escribe `hasta_que`, con guion bajo.',
};

const MAX_ERRORS = 50;
const MAX_DEPTH = 400;

/** Señal interna para abandonar la sentencia actual. El error, si lo hay, ya se registró. */
class ParseFailure {}

class Parser {
  readonly errors: CodexivoError[] = [];
  private position = 0;
  private nextId = 1;
  private depth = 0;

  constructor(private readonly tokens: Token[]) {}

  parseProgram(): ast.Program {
    const start = this.current.span.start;
    const statements = this.parseStatements(TokenType.EOF);
    return { kind: 'Program', id: this.id(), statements, span: { start, end: this.current.span.end } };
  }

  // ── utilidades ─────────────────────────────────────────────────────────────

  private get current(): Token {
    return this.tokens[this.position] ?? this.tokens[this.tokens.length - 1]!;
  }

  private get previous(): Token {
    return this.tokens[this.position - 1] ?? this.current;
  }

  private peek(ahead = 1): Token {
    return this.tokens[this.position + ahead] ?? this.tokens[this.tokens.length - 1]!;
  }

  private id(): number {
    return this.nextId++;
  }

  private advance(): Token {
    const token = this.current;
    if (token.type !== TokenType.EOF) this.position += 1;
    return token;
  }

  private check(type: TokenType): boolean {
    return this.current.type === type;
  }

  private match(type: TokenType): boolean {
    if (!this.check(type)) return false;
    this.advance();
    return true;
  }

  private spanFrom(start: Position): Span {
    return { start, end: this.previous.span.end };
  }

  private error(code: string, message: string, span: Span, hint?: string): never {
    if (this.errors.length < MAX_ERRORS) {
      this.errors.push(new CodexivoError({ kind: 'sintaxis', code, message, hint, span }));
    }
    throw new ParseFailure();
  }

  /** Un token ILLEGAL ya tiene su error léxico; no lo reportamos dos veces. */
  private failSilentlyOnIllegal(): void {
    if (this.check(TokenType.ILLEGAL)) throw new ParseFailure();
  }

  private expect(type: TokenType, context: string, hint?: string): Token {
    if (this.check(type)) return this.advance();
    this.failSilentlyOnIllegal();
    const found = this.current;
    let finalHint = hint;
    if (type === TokenType.RPAREN && found.type === TokenType.ASSIGN) {
      finalHint = 'Para comparar se usa `==`; un solo `=` sirve para asignar.';
    }
    this.error(
      'TOKEN_ESPERADO',
      `Se esperaba ${describeTokenType(type)} ${context}, pero se encontró ${describeToken(found)}.`,
      found.span,
      finalHint,
    );
  }

  private enter(): void {
    this.depth += 1;
    if (this.depth > MAX_DEPTH) {
      this.error(
        'ANIDAMIENTO_EXCESIVO',
        'El programa tiene demasiados niveles anidados.',
        this.current.span,
        'Divide la expresión en variables intermedias.',
      );
    }
  }

  private leave(): void {
    this.depth -= 1;
  }

  /** Salta tokens hasta un punto seguro para seguir analizando después de un error. */
  private synchronize(failedAt: Token): void {
    if (this.position === this.tokens.indexOf(failedAt) && !this.check(TokenType.EOF)) this.advance();
    while (!this.check(TokenType.EOF)) {
      if (this.previous.type === TokenType.SEMICOLON) return;
      if (this.check(TokenType.RBRACE)) return;
      if (STATEMENT_KEYWORDS.has(this.current.type)) return;
      if (this.current.span.start.line > failedAt.span.start.line) return;
      this.advance();
    }
  }

  // ── sentencias ─────────────────────────────────────────────────────────────

  private parseStatements(terminator: TokenType.EOF | TokenType.RBRACE): ast.Statement[] {
    const statements: ast.Statement[] = [];
    let recovering = false;
    while (!this.check(terminator) && !this.check(TokenType.EOF)) {
      const failedAt = this.current;
      try {
        if (terminator === TokenType.EOF && this.check(TokenType.RBRACE)) {
          // Una `}` sobrante después de un error suele ser parte de lo que ya se reportó.
          if (recovering) {
            this.advance();
            continue;
          }
          this.error('LLAVE_SOBRANTE', 'Sobra esta `}`: no hay ningún bloque abierto.', this.current.span);
        }
        statements.push(this.parseStatement());
        recovering = false;
      } catch (error) {
        if (!(error instanceof ParseFailure)) throw error;
        this.depth = 0;
        recovering = true;
        this.synchronize(failedAt);
      }
    }
    return statements;
  }

  private parseStatement(): ast.Statement {
    const token = this.current;
    switch (token.type) {
      case TokenType.SEMICOLON:
        this.advance();
        return this.parseStatementAfterStraySemicolon();
      case TokenType.LET:
        return this.endSimpleStatement(this.parseVariableDeclaration());
      case TokenType.RETURN:
        return this.endSimpleStatement(this.parseReturn());
      case TokenType.IF:
        return this.endCompoundStatement(this.parseIf());
      case TokenType.WHILE:
        return this.endCompoundStatement(this.parseWhile());
      case TokenType.DO:
        return this.endSimpleStatement(this.parseDoUntil());
      case TokenType.FOR:
        return this.endCompoundStatement(this.parseFor());
      case TokenType.LBRACE:
        return this.endCompoundStatement(this.parseBlock('para abrir el bloque'));
      case TokenType.ELSE:
      case TokenType.ELSEIF:
        this.error(
          'RAMA_SIN_SI',
          `${describeToken(token)} tiene que ir justo después del \`}\` de un \`si\`.`,
          token.span,
        );
      case TokenType.UNTIL:
        this.error('HASTA_QUE_SIN_HACER', '`hasta_que` tiene que ir justo después del `}` de un `hacer`.', token.span);
      case TokenType.IDENT: {
        const typoHint = KEYWORD_LIKE_TYPOS[token.lexeme];
        const next = this.peek();
        if (typoHint && (next.type === TokenType.LBRACE || next.type === TokenType.IF || next.type === TokenType.LPAREN)) {
          this.error('PALABRA_DESCONOCIDA', `\`${token.lexeme}\` no es una palabra de Codexivo.`, token.span, typoHint);
        }
        if (ASSIGNMENT_OPERATORS[next.type]) {
          return this.endSimpleStatement(this.parseAssignment());
        }
        return this.endSimpleStatement(this.parseExpressionStatement());
      }
      default:
        return this.endSimpleStatement(this.parseExpressionStatement());
    }
  }

  private parseStatementAfterStraySemicolon(): ast.Statement {
    // `;;` o un `;` suelto no hacen nada; seguimos con lo que venga.
    if (this.check(TokenType.EOF) || this.check(TokenType.RBRACE)) {
      const span = this.previous.span;
      return { kind: 'Block', id: this.id(), statements: [], span };
    }
    return this.parseStatement();
  }

  /** Después de una sentencia simple va `;`, el final de la línea, `}` o el final del programa. */
  private endSimpleStatement<T extends ast.Statement>(statement: T): T {
    if (this.match(TokenType.SEMICOLON)) return statement;
    if (this.check(TokenType.RBRACE) || this.check(TokenType.EOF)) return statement;
    if (this.current.span.start.line > this.previous.span.end.line) return statement;
    this.failSilentlyOnIllegal();
    this.error(
      'FIN_DE_SENTENCIA',
      `Se esperaba \`;\` o un salto de línea antes de ${describeToken(this.current)}.`,
      this.current.span,
      'Si querías combinar dos valores, falta un operador entre ellos.',
    );
  }

  private endCompoundStatement<T extends ast.Statement>(statement: T): T {
    this.match(TokenType.SEMICOLON);
    return statement;
  }

  private parseVariableDeclaration(): ast.VariableDeclaration {
    const start = this.advance().span.start; // variable
    const name = this.parseBindingName('después de `variable`');
    this.expect(TokenType.ASSIGN, `después de \`variable ${name.name}\``, `Toda variable empieza con un valor: \`variable ${name.name} = 0\`.`);
    const value = this.parseExpression();
    if (value.kind === 'FunctionLiteral' && !value.name) value.name = name.name;
    return { kind: 'VariableDeclaration', id: this.id(), name, value, span: this.spanFrom(start) };
  }

  private parseBindingName(context: string): ast.Identifier {
    const token = this.current;
    if (token.type !== TokenType.IDENT) {
      this.failSilentlyOnIllegal();
      if (token.lexeme && /^[a-z_]+$/.test(token.lexeme) && token.type !== TokenType.EOF) {
        this.error(
          'PALABRA_RESERVADA',
          `\`${token.lexeme}\` es una palabra reservada y no se puede usar como nombre.`,
          token.span,
          'Elige otro nombre, por ejemplo agregando una palabra: `valor_inicial`.',
        );
      }
      this.error('NOMBRE_ESPERADO', `Se esperaba un nombre ${context}, pero se encontró ${describeToken(token)}.`, token.span);
    }
    this.advance();
    return { kind: 'Identifier', id: this.id(), name: token.lexeme, span: token.span };
  }

  private parseAssignment(): ast.Assignment {
    const targetToken = this.advance();
    const target: ast.Identifier = { kind: 'Identifier', id: this.id(), name: targetToken.lexeme, span: targetToken.span };
    const operator = ASSIGNMENT_OPERATORS[this.advance().type]!;
    const value = this.parseExpression();
    if (value.kind === 'FunctionLiteral' && !value.name) value.name = target.name;
    return { kind: 'Assignment', id: this.id(), target, operator, value, span: this.spanFrom(targetToken.span.start) };
  }

  private parseExpressionStatement(): ast.ExpressionStatement {
    const start = this.current.span.start;
    const expression = this.parseExpression();
    if (ASSIGNMENT_OPERATORS[this.current.type]) {
      this.error(
        'ASIGNACIÓN_INVÁLIDA',
        'Solo se le puede asignar un valor a una variable.',
        this.current.span,
        expression.kind === 'Index' ? 'Cambiar un elemento de una lista con `lista[i] = valor` llegará en la siguiente versión.' : undefined,
      );
    }
    return { kind: 'ExpressionStatement', id: this.id(), expression, span: this.spanFrom(start) };
  }

  private parseReturn(): ast.Return {
    const keyword = this.advance();
    const endsHere =
      this.check(TokenType.SEMICOLON) ||
      this.check(TokenType.RBRACE) ||
      this.check(TokenType.EOF) ||
      this.current.span.start.line > keyword.span.end.line;
    const value = endsHere ? undefined : this.parseExpression();
    return { kind: 'Return', id: this.id(), value, span: this.spanFrom(keyword.span.start) };
  }

  private parseBlock(context: string): ast.Block {
    const open = this.expect(TokenType.LBRACE, context, 'Los bloques de Codexivo siempre van entre llaves `{ }`.');
    const statements = this.parseStatements(TokenType.RBRACE);
    if (!this.check(TokenType.RBRACE)) {
      this.error(
        'BLOQUE_SIN_CERRAR',
        `Falta \`}\` para cerrar el bloque que empieza en la línea ${open.span.start.line}.`,
        open.span,
      );
    }
    this.advance();
    return { kind: 'Block', id: this.id(), statements, span: this.spanFrom(open.span.start) };
  }

  private parseCondition(keyword: string): ast.Expression {
    this.expect(TokenType.LPAREN, `después de \`${keyword}\``, `La condición va entre paréntesis: \`${keyword} (x > 0)\`.`);
    const condition = this.parseExpression();
    this.expect(TokenType.RPAREN, `para cerrar la condición de \`${keyword}\``);
    return condition;
  }

  private parseIf(): ast.If {
    const start = this.current.span.start;
    const branches: ast.IfBranch[] = [];
    let keyword = 'si';
    do {
      const branchStart = this.advance().span.start; // si / pero_si
      const condition = this.parseCondition(keyword);
      const body = this.parseBlock(`después de la condición de \`${keyword}\``);
      branches.push({ condition, body, span: this.spanFrom(branchStart) });
      keyword = 'pero_si';
    } while (this.check(TokenType.ELSEIF));

    let alternative: ast.Block | undefined;
    if (this.match(TokenType.ELSE)) {
      if (this.check(TokenType.IF)) {
        this.error('SI_NO_SI', 'Después de `si_no` va directamente un bloque.', this.current.span, 'Para otra condición usa `pero_si (…)`.');
      }
      alternative = this.parseBlock('después de `si_no`');
    }
    return { kind: 'If', id: this.id(), branches, alternative, span: this.spanFrom(start) };
  }

  private parseWhile(): ast.While {
    const start = this.advance().span.start;
    const condition = this.parseCondition('mientras');
    const body = this.parseBlock('después de la condición de `mientras`');
    return { kind: 'While', id: this.id(), condition, body, span: this.spanFrom(start) };
  }

  private parseDoUntil(): ast.DoUntil {
    const start = this.advance().span.start;
    const body = this.parseBlock('después de `hacer`');
    this.expect(TokenType.UNTIL, 'después del bloque de `hacer`', 'La forma completa es `hacer { … } hasta_que (condición);`.');
    const condition = this.parseCondition('hasta_que');
    return { kind: 'DoUntil', id: this.id(), body, condition, span: this.spanFrom(start) };
  }

  private parseFor(): ast.For {
    const start = this.advance().span.start;
    this.expect(TokenType.LPAREN, 'después de `para`', 'La forma completa es `para (variable i = 0; i < 10; i += 1) { … }`.');

    let init: ast.For['init'];
    if (!this.check(TokenType.SEMICOLON)) {
      if (this.check(TokenType.LET)) init = this.parseVariableDeclaration();
      else if (this.check(TokenType.IDENT) && ASSIGNMENT_OPERATORS[this.peek().type]) init = this.parseAssignment();
      else init = this.parseExpressionStatement();
    }
    this.expect(TokenType.SEMICOLON, 'después del inicio del `para`');

    const condition = this.check(TokenType.SEMICOLON) ? undefined : this.parseExpression();
    this.expect(TokenType.SEMICOLON, 'después de la condición del `para`');

    let update: ast.For['update'];
    if (!this.check(TokenType.RPAREN)) {
      if (this.check(TokenType.IDENT) && ASSIGNMENT_OPERATORS[this.peek().type]) update = this.parseAssignment();
      else update = this.parseExpressionStatement();
    }
    this.expect(TokenType.RPAREN, 'para cerrar el `para`');

    const body = this.parseBlock('después de `para (…)`');
    return { kind: 'For', id: this.id(), init, condition, update, body, span: this.spanFrom(start) };
  }

  // ── expresiones ────────────────────────────────────────────────────────────

  private parseExpression(precedence: Precedence = Precedence.LOWEST): ast.Expression {
    this.enter();
    let left = this.parsePrefix();
    while (precedence < (INFIX_PRECEDENCE[this.current.type] ?? Precedence.LOWEST)) {
      left = this.parseInfix(left);
    }
    this.leave();
    return left;
  }

  private parsePrefix(): ast.Expression {
    const token = this.current;
    switch (token.type) {
      case TokenType.NUMBER:
        this.advance();
        return { kind: 'NumberLiteral', id: this.id(), value: token.value as number, span: token.span };
      case TokenType.STRING:
        this.advance();
        return { kind: 'StringLiteral', id: this.id(), value: token.value as string, span: token.span };
      case TokenType.TRUE:
      case TokenType.FALSE:
        this.advance();
        return { kind: 'BooleanLiteral', id: this.id(), value: token.type === TokenType.TRUE, span: token.span };
      case TokenType.NULL:
        this.advance();
        return { kind: 'NullLiteral', id: this.id(), span: token.span };
      case TokenType.IDENT:
        this.advance();
        return { kind: 'Identifier', id: this.id(), name: token.lexeme, span: token.span };
      case TokenType.LPAREN: {
        this.advance();
        const expression = this.parseExpression();
        this.expect(TokenType.RPAREN, 'para cerrar el paréntesis');
        return expression;
      }
      case TokenType.LBRACKET:
        return this.parseList();
      case TokenType.MINUS: {
        this.advance();
        const operand = this.parseExpression(Precedence.UNARY);
        return { kind: 'Unary', id: this.id(), operator: '-', operand, span: this.spanFrom(token.span.start) };
      }
      case TokenType.NOT:
      case TokenType.BANG: {
        this.advance();
        const operand = this.parseExpression(Precedence.NOT);
        return { kind: 'Unary', id: this.id(), operator: 'no', operand, span: this.spanFrom(token.span.start) };
      }
      case TokenType.FUNCTION:
        return this.parseFunction();
      case TokenType.ILLEGAL:
        throw new ParseFailure();
      case TokenType.IF:
      case TokenType.WHILE:
      case TokenType.FOR:
      case TokenType.DO:
      case TokenType.LET:
      case TokenType.RETURN:
        this.error(
          'SENTENCIA_EN_EXPRESIÓN',
          `${describeToken(token)} empieza una sentencia y no se puede usar dentro de una expresión.`,
          token.span,
        );
      case TokenType.EOF:
        this.error('EXPRESIÓN_INCOMPLETA', 'El programa terminó a mitad de una expresión.', token.span, 'Revisa que no falte un valor al final.');
      default:
        this.error(
          'EXPRESIÓN_ESPERADA',
          `Se esperaba un valor, pero se encontró ${describeToken(token)}.`,
          token.span,
          /^[a-z_]+$/.test(token.lexeme)
            ? `\`${token.lexeme}\` es una palabra reservada; no se puede usar como nombre de variable.`
            : undefined,
        );
    }
  }

  private parseInfix(left: ast.Expression): ast.Expression {
    const token = this.current;
    const start = left.span.start;
    switch (token.type) {
      case TokenType.LPAREN: {
        this.advance();
        const args = this.parseList_(TokenType.RPAREN, 'para cerrar los argumentos');
        return { kind: 'Call', id: this.id(), callee: left, args, span: this.spanFrom(start) };
      }
      case TokenType.LBRACKET: {
        this.advance();
        if (this.check(TokenType.RBRACKET)) {
          this.error('ÍNDICE_VACÍO', 'Falta el índice entre los corchetes.', this.current.span, 'Por ejemplo: `lista[0]`.');
        }
        const index = this.parseExpression();
        this.expect(TokenType.RBRACKET, 'para cerrar el índice');
        return { kind: 'Index', id: this.id(), object: left, index, span: this.spanFrom(start) };
      }
      case TokenType.AND:
      case TokenType.OR: {
        this.advance();
        const precedence = INFIX_PRECEDENCE[token.type]!;
        const right = this.parseExpression(precedence);
        const operator = token.type === TokenType.AND ? 'y' : 'o';
        return { kind: 'Logical', id: this.id(), operator, left, right, span: this.spanFrom(start) };
      }
      default: {
        this.advance();
        const precedence = INFIX_PRECEDENCE[token.type]!;
        const right = this.parseExpression(precedence);
        const operator = BINARY_OPERATORS[token.type]!;
        if (precedence === Precedence.COMPARE && INFIX_PRECEDENCE[this.current.type] === Precedence.COMPARE) {
          this.error(
            'COMPARACIÓN_ENCADENADA',
            'No se pueden encadenar comparaciones.',
            { start, end: this.current.span.end },
            'Une las dos comparaciones con `y`, por ejemplo: `1 < x y x < 5`.',
          );
        }
        return { kind: 'Binary', id: this.id(), operator, left, right, span: this.spanFrom(start) };
      }
    }
  }

  private parseList(): ast.ListLiteral {
    const start = this.advance().span.start;
    const elements = this.parseList_(TokenType.RBRACKET, 'para cerrar la lista');
    return { kind: 'ListLiteral', id: this.id(), elements, span: this.spanFrom(start) };
  }

  /** Expresiones separadas por comas hasta `closing`. Se permite una coma final. */
  private parseList_(closing: TokenType, context: string): ast.Expression[] {
    const items: ast.Expression[] = [];
    while (!this.check(closing)) {
      items.push(this.parseExpression());
      if (!this.match(TokenType.COMMA)) break;
    }
    this.expect(closing, context);
    return items;
  }

  private parseFunction(): ast.FunctionLiteral {
    const start = this.advance().span.start;
    if (this.check(TokenType.IDENT)) {
      const name = this.current.lexeme;
      this.error(
        'PROCEDIMIENTO_CON_NOMBRE',
        'Los procedimientos con nombre todavía no están disponibles.',
        this.current.span,
        `Por ahora escribe \`variable ${name} = procedimiento(…) { … };\`.`,
      );
    }
    this.expect(TokenType.LPAREN, 'después de `procedimiento`', 'Los parámetros van entre paréntesis: `procedimiento(a, b) { … }`.');
    const params: ast.Identifier[] = [];
    const seen = new Set<string>();
    while (!this.check(TokenType.RPAREN)) {
      const param = this.parseBindingName('como parámetro');
      if (seen.has(param.name)) {
        this.error('PARÁMETRO_REPETIDO', `El parámetro \`${param.name}\` está repetido.`, param.span);
      }
      seen.add(param.name);
      params.push(param);
      if (!this.match(TokenType.COMMA)) break;
    }
    this.expect(TokenType.RPAREN, 'para cerrar los parámetros');
    const body = this.parseBlock('para el cuerpo del procedimiento');
    return { kind: 'FunctionLiteral', id: this.id(), params, body, span: this.spanFrom(start) };
  }
}
