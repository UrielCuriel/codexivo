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
  /** Cómo se construyó el árbol, paso a paso. Solo con `{ trace: true }`. */
  trace?: ParseEvent[];
}

export interface ParseOptions {
  /** Registra en `trace` cada paso del parser. Sin esta opción el parser no hace ningún trabajo extra. */
  trace?: boolean;
}

/** Un operador en una decisión de precedencia. */
export interface PrecedenceOperator {
  /** El texto del operador tal como está en el código (`+`, `y`, `es_igual_a`, `(` de una llamada…). */
  operator: string;
  /** La precedencia con la que se compara: más alta, agrupa antes. */
  precedence: number;
}

/**
 * Un paso del parser. Todos son objetos planos con su `span`: se pueden convertir a JSON o mandar desde un Web Worker.
 *
 * - `consume`: toma el token número `index` de `tokens`.
 * - `enter` / `exit`: empieza o termina de construir un nodo. `exit.id` es el `id` del nodo en el AST. Un nodo que se
 *   construye a partir de otro que ya estaba hecho (el lado izquierdo de `1 + 2`, el procedimiento de una llamada, la
 *   variable de una asignación) lo indica en `enter.left`.
 * - `precedence`: el parser Pratt decide de quién es `operand`. Si `incoming` tiene más precedencia que `building` (el
 *   operador que se está construyendo), `incoming` se lo lleva; si no, se queda con `building`. Sin `building`, no hay
 *   operador esperando ese valor.
 * - `error`: un error de sintaxis (el mismo de `errors`).
 * - `recover`: después de un error, el parser abandona los nodos que seguían abiertos (`abandoned`, del más interno al
 *   más externo; no tendrán `exit`), salta los tokens `skipped.from` a `skipped.to - 1` y sigue desde `skipped.to`.
 */
export type ParseEvent =
  | { type: 'consume'; index: number; tokenType: TokenType; lexeme: string; span: Span }
  | { type: 'enter'; kind: ast.Node['kind']; left?: number; span: Span }
  | { type: 'exit'; kind: ast.Node['kind']; id: number; span: Span }
  | {
      type: 'precedence';
      operand: number;
      building?: PrecedenceOperator;
      incoming: PrecedenceOperator;
      decision: 'se_queda' | 'se_lo_lleva';
      span: Span;
    }
  | { type: 'error'; code: string; message: string; span: Span }
  | {
      type: 'recover';
      abandoned: ast.Node['kind'][];
      skipped: { from: number; to: number };
      span: Span;
    };

/** Analiza el código y construye el AST. Nunca lanza: los problemas se reportan en `errors`. */
export const parse = (source: string, options: ParseOptions = {}): ParseResult => {
  const { tokens, errors: lexicalErrors } = tokenize(source);
  const parser = new Parser(tokens, options.trace ? [] : undefined);
  const program = parser.parseProgram();
  const errors = [...lexicalErrors, ...parser.errors].sort(
    (a, b) => (a.span?.start.offset ?? 0) - (b.span?.start.offset ?? 0),
  );
  return parser.trace ? { program, tokens, errors, trace: parser.trace } : { program, tokens, errors };
};

/** `parse` con la traza: cómo se construyó el árbol, paso a paso. */
export const traceParse = (source: string): ParseResult & { trace: ParseEvent[] } =>
  parse(source, { trace: true }) as ParseResult & { trace: ParseEvent[] };

enum Precedence {
  LOWEST,
  OR,
  AND,
  NOT,
  COMPARE,
  SUM,
  PRODUCT,
  UNARY,
  POWER,
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
  [TokenType.PERCENT]: Precedence.PRODUCT,
  [TokenType.MOD]: Precedence.PRODUCT,
  [TokenType.DIV]: Precedence.PRODUCT,
  [TokenType.CARET]: Precedence.POWER,
  [TokenType.LPAREN]: Precedence.CALL,
  [TokenType.LBRACKET]: Precedence.CALL,
  [TokenType.DOT]: Precedence.CALL,
};

const BINARY_OPERATORS: Partial<Record<TokenType, ast.BinaryOperator>> = {
  [TokenType.PLUS]: '+',
  [TokenType.MINUS]: '-',
  [TokenType.STAR]: '*',
  [TokenType.SLASH]: '/',
  [TokenType.PERCENT]: 'mod',
  [TokenType.MOD]: 'mod',
  [TokenType.DIV]: 'div',
  [TokenType.CARET]: '^',
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
  [TokenType.PERCENT_ASSIGN]: '%=',
};

const INCREMENT_OPERATORS: Partial<Record<TokenType, ast.IncrementOperator>> = {
  [TokenType.INCREMENT]: '++',
  [TokenType.DECREMENT]: '--',
};

const STATEMENT_KEYWORDS = new Set([
  TokenType.LET,
  TokenType.DOMAIN,
  TokenType.CONST,
  TokenType.REPEAT,
  TokenType.FOR_EACH,
  TokenType.BREAK,
  TokenType.CONTINUE,
  TokenType.FUNCTION,
  TokenType.RETURN,
  TokenType.IF,
  TokenType.WHILE,
  TokenType.DO,
  TokenType.FOR,
]);

/** Lo único que puede ir dentro de un `dominio`. */
const DOMAIN_MEMBERS = new Set<ast.Statement['kind']>(['VariableDeclaration', 'FunctionDeclaration', 'Domain']);

/** Cómo empieza una sentencia, para nombrarla en un mensaje. */
const printStart = (statement: ast.Statement): string | undefined => {
  switch (statement.kind) {
    case 'If':
      return 'si';
    case 'While':
      return 'mientras';
    case 'DoUntil':
      return 'hacer';
    case 'For':
      return 'para';
    case 'ForEach':
      return 'para_cada';
    case 'Repeat':
      return 'repetir';
    case 'Return':
      return 'regresa';
    case 'Break':
      return 'romper';
    case 'Continue':
      return 'continuar';
    case 'Block':
      return '{';
    default:
      return undefined;
  }
};

const KEYWORD_LIKE_TYPOS: Readonly<Record<string, string>> = {
  sino: 'En Codexivo se escribe `si_no`, con guion bajo.',
  pero: 'En Codexivo se escribe `pero_si`, con guion bajo.',
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
  /**
   * Paréntesis, corchetes o llaves abiertos alrededor de la expresión actual. Dentro de ellos una expresión puede
   * seguir en la línea siguiente; fuera, un salto de línea la termina (salvo después de un operador).
   */
  private grouping = 0;
  /** Bucles abiertos alrededor de la sentencia actual, sin contar los de afuera de un procedimiento. */
  private loopDepth = 0;
  /** Con traza: los nodos con `enter` que todavía no tienen `exit`. */
  private readonly open: ast.Node['kind'][] = [];

  constructor(
    private readonly tokens: Token[],
    /** Los pasos del parser, solo si se pidió la traza. */
    readonly trace?: ParseEvent[],
  ) {}

  parseProgram(): ast.Program {
    const start = this.current.span.start;
    this.begin('Program');
    const statements = this.parseStatements(TokenType.EOF);
    return this.finish({ kind: 'Program', id: this.id(), statements, span: { start, end: this.current.span.end } });
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
    if (token.type === TokenType.EOF) return token;
    this.trace?.push({
      type: 'consume',
      index: this.position,
      tokenType: token.type,
      lexeme: token.lexeme,
      span: token.span,
    });
    this.position += 1;
    return token;
  }

  /** Salta un token al recuperarse de un error; en la traza va dentro de `recover`, no como `consume`. */
  private skip(): void {
    if (!this.check(TokenType.EOF)) this.position += 1;
  }

  // ── traza ──────────────────────────────────────────────────────────────────

  /** Empieza a construir un nodo. `left` es el nodo ya construido que el nuevo toma como primer hijo. */
  private begin(kind: ast.Node['kind'], left?: ast.Node, span: Span = this.current.span): void {
    if (!this.trace) return;
    this.open.push(kind);
    this.trace.push(left ? { type: 'enter', kind, left: left.id, span } : { type: 'enter', kind, span });
  }

  /** Termina de construir un nodo (su `begin` ya se registró). */
  private finish<T extends ast.Node>(node: T): T {
    if (!this.trace) return node;
    this.open.pop();
    this.trace.push({ type: 'exit', kind: node.kind, id: node.id, span: node.span });
    return node;
  }

  /** Un nodo hecho de un solo token: `begin`, `consume` y `finish`. */
  private leaf<T extends ast.Node>(kind: T['kind'], build: (token: Token, id: number) => T): T {
    this.begin(kind);
    const token = this.advance();
    return this.finish(build(token, this.id()));
  }

  private tracePrecedence(
    operand: ast.Expression,
    precedence: Precedence,
    owner: Token | undefined,
    incoming: Precedence,
    takes: boolean,
  ): void {
    this.trace!.push({
      type: 'precedence',
      operand: operand.id,
      ...(owner ? { building: { operator: owner.lexeme, precedence } } : {}),
      incoming: { operator: this.current.lexeme, precedence: incoming },
      decision: takes ? 'se_lo_lleva' : 'se_queda',
      span: this.current.span,
    });
  }

  /** Después de un error: los nodos abiertos desde `openBefore` se abandonan y se saltaron los tokens desde `from`. */
  private traceRecover(openBefore: number, from: number): void {
    if (!this.trace) return;
    const to = this.position;
    const span =
      to > from
        ? { start: this.tokens[from]!.span.start, end: this.tokens[to - 1]!.span.end }
        : { start: this.current.span.start, end: this.current.span.start };
    const abandoned = this.open.splice(openBefore).reverse();
    this.trace.push({ type: 'recover', abandoned, skipped: { from, to }, span });
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
    this.report(code, message, span, hint);
    throw new ParseFailure();
  }

  /** Registra un error sin abandonar lo que se está analizando. */
  private report(code: string, message: string, span: Span, hint?: string): void {
    if (this.errors.length >= MAX_ERRORS) return;
    this.errors.push(new CodexivoError({ kind: 'sintaxis', code, message, hint, span }));
    this.trace?.push({ type: 'error', code, message, span });
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
      finalHint = 'Para comparar se usa `es_igual_a` (o `==`); un solo `=` sirve para asignar.';
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
    if (this.position === this.tokens.indexOf(failedAt)) this.skip();
    while (!this.check(TokenType.EOF)) {
      if (this.previous.type === TokenType.SEMICOLON) return;
      if (this.check(TokenType.RBRACE)) return;
      if (STATEMENT_KEYWORDS.has(this.current.type)) return;
      if (this.current.span.start.line > failedAt.span.start.line) return;
      this.skip();
    }
  }

  // ── sentencias ─────────────────────────────────────────────────────────────

  private parseStatements(terminator: TokenType.EOF | TokenType.RBRACE): ast.Statement[] {
    // Un bloque dentro de un paréntesis (el cuerpo de un procedimiento que se pasa como argumento) vuelve a
    // terminar sus sentencias con el salto de línea.
    const grouping = this.grouping;
    this.grouping = 0;
    try {
      return this.parseStatementList(terminator);
    } finally {
      this.grouping = grouping;
    }
  }

  private parseStatementList(terminator: TokenType.EOF | TokenType.RBRACE): ast.Statement[] {
    const statements: ast.Statement[] = [];
    let recovering = false;
    while (!this.check(terminator) && !this.check(TokenType.EOF)) {
      const failedAt = this.current;
      const openBefore = this.open.length;
      try {
        if (terminator === TokenType.EOF && this.check(TokenType.RBRACE)) {
          // Una `}` sobrante después de un error suele ser parte de lo que ya se reportó.
          if (recovering) {
            const from = this.position;
            this.skip();
            this.traceRecover(openBefore, from);
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
        const from = this.position;
        this.synchronize(failedAt);
        this.traceRecover(openBefore, from);
      }
    }
    this.checkDuplicateProcedures(statements);
    return statements;
  }

  /** Un procedimiento con nombre existe desde el inicio de su bloque, así que su nombre no se puede repetir ahí. */
  private checkDuplicateProcedures(statements: ast.Statement[]): void {
    const procedures = new Set(
      statements.flatMap(statement => (statement.kind === 'FunctionDeclaration' ? [statement.name.name] : [])),
    );
    if (procedures.size === 0) return;
    const seen = new Set<string>();
    for (const statement of statements) {
      if (statement.kind !== 'FunctionDeclaration' && statement.kind !== 'VariableDeclaration') continue;
      const { name } = statement;
      if (!procedures.has(name.name)) continue;
      if (statement.kind === 'FunctionDeclaration' && !seen.has(name.name)) {
        seen.add(name.name);
        continue;
      }
      if (this.errors.length >= MAX_ERRORS) return;
      this.report(
        'NOMBRE_REPETIDO',
        `Ya hay un procedimiento llamado \`${name.name}\` en este bloque.`,
        name.span,
        'Un procedimiento con nombre existe desde el inicio de su bloque; cambia uno de los dos nombres.',
      );
    }
  }

  private parseStatement(): ast.Statement {
    const token = this.current;
    switch (token.type) {
      case TokenType.SEMICOLON:
        this.advance();
        return this.parseStatementAfterStraySemicolon();
      case TokenType.LET:
      case TokenType.CONST:
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
      case TokenType.REPEAT:
        return this.endCompoundStatement(this.parseRepeat());
      case TokenType.FOR_EACH:
        return this.endCompoundStatement(this.parseForEach());
      case TokenType.DOMAIN:
        return this.endCompoundStatement(this.parseDomain());
      case TokenType.BREAK:
      case TokenType.CONTINUE:
        return this.endSimpleStatement(this.parseLoopJump());
      case TokenType.IN:
        this.error('EN_SIN_PARA_CADA', '`en` solo se usa dentro de `para_cada … en …`.', token.span);
      case TokenType.FUNCTION:
        if (this.peek().type === TokenType.IDENT) return this.endCompoundStatement(this.parseFunctionDeclaration());
        return this.endSimpleStatement(this.parseSimpleStatement());
      case TokenType.LBRACE:
        if (
          (this.peek().type === TokenType.STRING || this.peek().type === TokenType.NUMBER) &&
          this.peek(2).type === TokenType.COLON
        ) {
          this.error(
            'DICCIONARIO_COMO_SENTENCIA',
            'Al inicio de una sentencia, `{` abre un bloque, no un diccionario.',
            token.span,
            'Guarda el diccionario en una variable: `variable d = { "clave": valor }`.',
          );
        }
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
        if (
          typoHint &&
          (next.type === TokenType.LBRACE || next.type === TokenType.IF || next.type === TokenType.LPAREN)
        ) {
          this.error('PALABRA_DESCONOCIDA', `\`${token.lexeme}\` no es una palabra de Codexivo.`, token.span, typoHint);
        }
        return this.endSimpleStatement(this.parseSimpleStatement());
      }
      default:
        return this.endSimpleStatement(this.parseSimpleStatement());
    }
  }

  private parseStatementAfterStraySemicolon(): ast.Statement {
    // `;;` o un `;` suelto no hacen nada; seguimos con lo que venga.
    if (this.check(TokenType.EOF) || this.check(TokenType.RBRACE)) {
      const span = this.previous.span;
      this.begin('Block', undefined, span);
      return this.finish({ kind: 'Block', id: this.id(), statements: [], span });
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
    this.begin('VariableDeclaration');
    const keyword = this.advance(); // variable / constante
    const constant = keyword.type === TokenType.CONST;
    const name = this.parseBindingName(`después de \`${keyword.lexeme}\``);
    this.expect(
      TokenType.ASSIGN,
      `después de \`${keyword.lexeme} ${name.name}\``,
      constant
        ? `Toda constante necesita su valor desde el principio: \`constante ${name.name} = 10\`.`
        : `Toda variable empieza con un valor: \`variable ${name.name} = 0\`.`,
    );
    const value = this.parseExpression();
    if (value.kind === 'FunctionLiteral' && !value.name) value.name = name.name;
    return this.finish({
      kind: 'VariableDeclaration',
      id: this.id(),
      constant,
      name,
      value,
      span: this.spanFrom(keyword.span.start),
    });
  }

  private parseBindingName(context: string): ast.Identifier {
    const token = this.current;
    if (token.type !== TokenType.IDENT) {
      this.failSilentlyOnIllegal();
      if (token.lexeme && /^[a-z_]+$/.test(token.lexeme) && token.type !== TokenType.EOF) {
        // Se salta la palabra para que, al recuperarse, no empiece otra sentencia (`variable dominio = 1`).
        this.advance();
        this.error(
          'PALABRA_RESERVADA',
          `\`${token.lexeme}\` es una palabra reservada y no se puede usar como nombre.`,
          token.span,
          'Elige otro nombre, por ejemplo agregando una palabra: `valor_inicial`.',
        );
      }
      this.error(
        'NOMBRE_ESPERADO',
        `Se esperaba un nombre ${context}, pero se encontró ${describeToken(token)}.`,
        token.span,
      );
    }
    return this.leaf('Identifier', (token, id) => ({ kind: 'Identifier', id, name: token.lexeme, span: token.span }));
  }

  /** Asignación (`x = …`, `lista[i] += …`), incremento (`i++`) o expresión. */
  private parseSimpleStatement(): ast.Assignment | ast.Increment | ast.ExpressionStatement {
    const start = this.current.span.start;
    const expression = this.parseExpression(Precedence.LOWEST, true);
    const operator = ASSIGNMENT_OPERATORS[this.current.type];
    const increment = INCREMENT_OPERATORS[this.current.type];
    if (!operator && !increment) {
      this.begin('ExpressionStatement', expression, expression.span);
      return this.finish({ kind: 'ExpressionStatement', id: this.id(), expression, span: this.spanFrom(start) });
    }
    if (expression.kind !== 'Identifier' && expression.kind !== 'Index') {
      this.error(
        'ASIGNACIÓN_INVÁLIDA',
        increment
          ? `\`${this.current.lexeme}\` solo funciona con una variable o un elemento, como \`i${this.current.lexeme}\` o \`lista[0]${this.current.lexeme}\`.`
          : 'Solo se le puede asignar un valor a una variable o a un elemento, como `x = 1` o `lista[0] = 1`.',
        this.current.span,
      );
    }
    this.begin(increment ? 'Increment' : 'Assignment', expression);
    this.advance();
    if (increment) {
      return this.finish({
        kind: 'Increment',
        id: this.id(),
        target: expression,
        operator: increment,
        span: this.spanFrom(start),
      });
    }
    const value = this.parseExpression();
    if (value.kind === 'FunctionLiteral' && !value.name && expression.kind === 'Identifier') {
      value.name = expression.name;
    }
    return this.finish({
      kind: 'Assignment',
      id: this.id(),
      target: expression,
      operator: operator!,
      value,
      span: this.spanFrom(start),
    });
  }

  private parseReturn(): ast.Return {
    this.begin('Return');
    const keyword = this.advance();
    const endsHere =
      this.check(TokenType.SEMICOLON) ||
      this.check(TokenType.RBRACE) ||
      this.check(TokenType.EOF) ||
      this.current.span.start.line > keyword.span.end.line;
    const value = endsHere ? undefined : this.parseExpression();
    return this.finish({ kind: 'Return', id: this.id(), value, span: this.spanFrom(keyword.span.start) });
  }

  private parseBlock(context: string): ast.Block {
    this.begin('Block');
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
    return this.finish({ kind: 'Block', id: this.id(), statements, span: this.spanFrom(open.span.start) });
  }

  /** Analiza `parse` dentro de paréntesis, corchetes o llaves, donde los saltos de línea no terminan nada. */
  private grouped<T>(parse: () => T): T {
    this.grouping += 1;
    try {
      return parse();
    } finally {
      this.grouping -= 1;
    }
  }

  private parseCondition(keyword: string): ast.Expression {
    this.expect(
      TokenType.LPAREN,
      `después de \`${keyword}\``,
      `La condición va entre paréntesis: \`${keyword} (x > 0)\`.`,
    );
    const condition = this.grouped(() => this.parseExpression());
    this.expect(TokenType.RPAREN, `para cerrar la condición de \`${keyword}\``);
    return condition;
  }

  private parseIf(): ast.If {
    const start = this.current.span.start;
    this.begin('If');
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
        this.error(
          'SI_NO_SI',
          'Después de `si_no` va directamente un bloque.',
          this.current.span,
          'Para otra condición usa `pero_si (…)`.',
        );
      }
      alternative = this.parseBlock('después de `si_no`');
    }
    return this.finish({ kind: 'If', id: this.id(), branches, alternative, span: this.spanFrom(start) });
  }

  private parseWhile(): ast.While {
    this.begin('While');
    const start = this.advance().span.start;
    const condition = this.parseCondition('mientras');
    const body = this.parseLoopBody('después de la condición de `mientras`');
    return this.finish({ kind: 'While', id: this.id(), condition, body, span: this.spanFrom(start) });
  }

  private parseDoUntil(): ast.DoUntil {
    this.begin('DoUntil');
    const start = this.advance().span.start;
    const body = this.parseLoopBody('después de `hacer`');
    this.expect(
      TokenType.UNTIL,
      'después del bloque de `hacer`',
      'La forma completa es `hacer { … } hasta_que (condición)`.',
    );
    const condition = this.parseCondition('hasta_que');
    return this.finish({ kind: 'DoUntil', id: this.id(), body, condition, span: this.spanFrom(start) });
  }

  private parseFor(): ast.For | ast.ForRange {
    this.begin(this.peek().type === TokenType.LPAREN ? 'For' : 'ForRange');
    const start = this.advance().span.start;
    // `para i desde …` cuenta; `para (…; …; …)` es la forma clásica.
    if (!this.check(TokenType.LPAREN)) return this.parseForRange(start);
    this.expect(
      TokenType.LPAREN,
      'después de `para`',
      'La forma completa es `para (variable i = 0; i < 10; i += 1) { … }`.',
    );

    const { init, condition, update } = this.grouped(() => {
      let init: ast.For['init'];
      if (!this.check(TokenType.SEMICOLON)) {
        if (this.check(TokenType.LET) || this.check(TokenType.CONST)) init = this.parseVariableDeclaration();
        else init = this.parseSimpleStatement();
      }
      this.expect(TokenType.SEMICOLON, 'después del inicio del `para`');

      const condition = this.check(TokenType.SEMICOLON) ? undefined : this.parseExpression();
      this.expect(TokenType.SEMICOLON, 'después de la condición del `para`');

      let update: ast.For['update'];
      if (!this.check(TokenType.RPAREN)) update = this.parseSimpleStatement();
      this.expect(TokenType.RPAREN, 'para cerrar el `para`');
      return { init, condition, update };
    });

    const body = this.parseLoopBody('después de `para (…)`');
    return this.finish({ kind: 'For', id: this.id(), init, condition, update, body, span: this.spanFrom(start) });
  }

  private parseForRange(start: Position): ast.ForRange {
    const form = 'La forma completa es `para i desde 1 hasta 10 { … }`.';
    if (this.check(TokenType.LET)) {
      // Se salta `variable` para no reportar también la declaración incompleta.
      this.advance();
      this.error(
        'TOKEN_ESPERADO',
        'La variable de `para … desde … hasta` se escribe sin `variable`.',
        this.current.span,
        form,
      );
    }
    const variable = this.parseBindingName('después de `para`');
    if (this.check(TokenType.ASSIGN)) {
      this.error(
        'TOKEN_ESPERADO',
        `Para contar se escribe \`desde\`, no \`=\`: \`para ${variable.name} desde 1 hasta 10\`.`,
        this.current.span,
        'La forma clásica `para (variable i = 0; i < 10; i++)` va entre paréntesis.',
      );
    }
    // Un `{` justo después de `desde`, `hasta` o `con_paso` es el cuerpo, no un diccionario: falta el valor.
    const value = (after: string): ast.Expression => {
      if (this.check(TokenType.LBRACE)) {
        this.error('EXPRESIÓN_ESPERADA', `Falta un valor después de \`${after}\`.`, this.current.span, form);
      }
      return this.parseExpression();
    };
    this.expect(TokenType.FROM, `después de \`para ${variable.name}\``, form);
    const from = value('desde');
    this.expect(TokenType.TO, 'después del inicio del `para`', form);
    const to = value('hasta');
    const step = this.match(TokenType.STEP) ? value('con_paso') : undefined;
    const body = this.parseLoopBody('después de `para … desde … hasta …`');
    return this.finish({ kind: 'ForRange', id: this.id(), variable, from, to, step, body, span: this.spanFrom(start) });
  }

  private parseRepeat(): ast.Repeat {
    this.begin('Repeat');
    const keyword = this.advance();
    if (this.check(TokenType.TIMES) || this.check(TokenType.LBRACE)) {
      this.error(
        'REPETIR_SIN_CANTIDAD',
        'Falta cuántas veces se repite.',
        this.current.span,
        'La forma completa es `repetir 4 veces { … }`.',
      );
    }
    const count = this.parseExpression();
    this.expect(
      TokenType.TIMES,
      'después de la cantidad de `repetir`',
      'La forma completa es `repetir 4 veces { … }`.',
    );
    const body = this.parseLoopBody('después de `repetir … veces`');
    return this.finish({ kind: 'Repeat', id: this.id(), count, body, span: this.spanFrom(keyword.span.start) });
  }

  private parseDomain(): ast.Domain {
    this.begin('Domain');
    const keyword = this.advance();
    const name = this.parseBindingName('después de `dominio`');
    this.begin('Block');
    const open = this.expect(
      TokenType.LBRACE,
      `después de \`dominio ${name.name}\``,
      'Lo que agrupa un dominio va entre llaves: `dominio calculadora { … }`.',
    );
    // Un dominio no está dentro de ningún bucle, aunque se escriba dentro de uno.
    const loopDepth = this.loopDepth;
    this.loopDepth = 0;
    let statements: ast.Statement[];
    try {
      statements = this.parseStatements(TokenType.RBRACE);
    } finally {
      this.loopDepth = loopDepth;
    }
    if (!this.check(TokenType.RBRACE)) {
      this.error(
        'BLOQUE_SIN_CERRAR',
        `Falta \`}\` para cerrar el dominio que empieza en la línea ${open.span.start.line}.`,
        open.span,
      );
    }
    this.advance();
    for (const statement of statements) {
      if (DOMAIN_MEMBERS.has(statement.kind)) continue;
      this.report(
        'DOMINIO_SOLO_DECLARACIONES',
        printStart(statement)
          ? `Un dominio solo agrupa declaraciones, y \`${printStart(statement)}\` no es una.`
          : 'Un dominio solo agrupa declaraciones, y esta sentencia no es una.',
        statement.span,
        'Dentro de `dominio` van `variable`, `constante`, `procedimiento` u otro `dominio`. Lo demás va en un procedimiento o fuera del dominio.',
      );
    }
    const body = this.finish<ast.Block>({
      kind: 'Block',
      id: this.id(),
      statements,
      span: this.spanFrom(open.span.start),
    });
    return this.finish({ kind: 'Domain', id: this.id(), name, body, span: this.spanFrom(keyword.span.start) });
  }

  private parseForEach(): ast.ForEach {
    this.begin('ForEach');
    const keyword = this.advance();
    const form = 'La forma completa es `para_cada fruta en frutas { … }`, sin paréntesis.';
    if (this.check(TokenType.LPAREN)) {
      this.error('TOKEN_ESPERADO', '`para_cada` no lleva paréntesis.', this.current.span, form);
    }
    const variable = this.parseBindingName('después de `para_cada`');
    let value: ast.Identifier | undefined;
    if (this.match(TokenType.COMMA)) {
      value = this.parseBindingName(`después de \`para_cada ${variable.name},\``);
      if (value.name === variable.name) {
        this.error('PARÁMETRO_REPETIDO', `La variable \`${value.name}\` está repetida.`, value.span);
      }
    }
    const names = value ? `${variable.name}, ${value.name}` : variable.name;
    this.expect(TokenType.IN, `después de \`para_cada ${names}\``, form);
    const iterable = this.parseExpression();
    const body = this.parseLoopBody('después de `para_cada … en …`');
    return this.finish({
      kind: 'ForEach',
      id: this.id(),
      variable,
      value,
      iterable,
      body,
      span: this.spanFrom(keyword.span.start),
    });
  }

  /** El cuerpo de un bucle: ahí sí se puede usar `romper` y `continuar`. */
  private parseLoopBody(context: string): ast.Block {
    this.loopDepth += 1;
    try {
      return this.parseBlock(context);
    } finally {
      this.loopDepth -= 1;
    }
  }

  private parseLoopJump(): ast.Break | ast.Continue {
    const kind = this.check(TokenType.BREAK) ? 'Break' : 'Continue';
    this.begin(kind);
    const token = this.advance();
    if (this.loopDepth === 0) {
      this.error(
        kind === 'Break' ? 'ROMPER_FUERA_DE_BUCLE' : 'CONTINUAR_FUERA_DE_BUCLE',
        `\`${token.lexeme}\` solo se puede usar dentro de un bucle.`,
        token.span,
        kind === 'Break'
          ? 'Para salir de un procedimiento usa `regresa`.'
          : 'Dentro de un procedimiento, `continuar` no afecta al bucle desde donde se llamó.',
      );
    }
    return this.finish({ kind, id: this.id(), span: token.span });
  }

  // ── expresiones ────────────────────────────────────────────────────────────

  /**
   * `statement` indica que la expresión es una sentencia completa, donde `i++` sí está permitido. `owner` es el operador
   * que espera esta expresión como su lado derecho (o su operando), con precedencia `precedence`; solo se usa en la traza.
   */
  private parseExpression(
    precedence: Precedence = Precedence.LOWEST,
    statement = false,
    owner?: Token,
  ): ast.Expression {
    this.enter();
    let left = this.parsePrefix();
    while (true) {
      const incoming = INFIX_PRECEDENCE[this.current.type];
      if (incoming === undefined) break;
      // Sin `;`, una línea que empieza con `-`, `(` o `[` es otra sentencia, no la continuación de la anterior.
      if (this.grouping === 0 && this.current.span.start.line > this.previous.span.end.line) break;
      // La decisión del parser Pratt: si el operador que llega agrupa más fuerte, se lleva a `left`.
      const takes = precedence < incoming;
      if (this.trace) this.tracePrecedence(left, precedence, owner, incoming, takes);
      if (!takes) break;
      left = this.parseInfix(left);
    }
    if (!statement && INCREMENT_OPERATORS[this.current.type]) this.incrementInExpression(left);
    this.leave();
    return left;
  }

  private incrementInExpression(left?: ast.Expression): never {
    const operator = this.current.lexeme;
    const name = left?.kind === 'Identifier' ? left.name : 'i';
    this.error(
      'INCREMENTO_EN_EXPRESIÓN',
      `\`${operator}\` es una sentencia: va sola, justo después del nombre de una variable.`,
      this.current.span,
      left?.kind === 'Identifier' || !left
        ? `Escribe \`${name}${operator}\` en su propia línea y después usa \`${name}\`.`
        : `Escribe el \`${operator}\` en su propia línea, antes o después de usar el valor.`,
    );
  }

  private parsePrefix(): ast.Expression {
    const token = this.current;
    switch (token.type) {
      case TokenType.NUMBER:
        return this.leaf('NumberLiteral', (_, id) => ({
          kind: 'NumberLiteral',
          id,
          value: token.value as number,
          span: token.span,
        }));
      case TokenType.STRING:
        return this.leaf('StringLiteral', (_, id) => ({
          kind: 'StringLiteral',
          id,
          value: token.value as string,
          span: token.span,
        }));
      case TokenType.TRUE:
      case TokenType.FALSE:
        return this.leaf('BooleanLiteral', (_, id) => ({
          kind: 'BooleanLiteral',
          id,
          value: token.type === TokenType.TRUE,
          span: token.span,
        }));
      case TokenType.NULL:
        return this.leaf('NullLiteral', (_, id) => ({ kind: 'NullLiteral', id, span: token.span }));
      case TokenType.IDENT:
        return this.leaf('Identifier', (_, id) => ({ kind: 'Identifier', id, name: token.lexeme, span: token.span }));
      case TokenType.LPAREN: {
        this.advance();
        const expression = this.grouped(() => this.parseExpression());
        this.expect(TokenType.RPAREN, 'para cerrar el paréntesis');
        return expression;
      }
      case TokenType.LBRACKET:
        return this.parseList();
      case TokenType.LBRACE:
        return this.parseDict();
      case TokenType.MINUS: {
        this.begin('Unary');
        this.advance();
        const operand = this.parseExpression(Precedence.UNARY, false, token);
        return this.finish({
          kind: 'Unary',
          id: this.id(),
          operator: '-',
          operand,
          span: this.spanFrom(token.span.start),
        });
      }
      case TokenType.NOT:
      case TokenType.BANG: {
        this.begin('Unary');
        this.advance();
        const operand = this.parseExpression(Precedence.NOT, false, token);
        return this.finish({
          kind: 'Unary',
          id: this.id(),
          operator: 'no',
          operand,
          span: this.spanFrom(token.span.start),
        });
      }
      case TokenType.FUNCTION:
        if (this.peek().type === TokenType.IDENT) {
          this.error(
            'PROCEDIMIENTO_CON_NOMBRE',
            'Un procedimiento con nombre es una sentencia; no puede ir dentro de una expresión.',
            this.peek().span,
            'Como valor, escríbelo sin nombre: `variable doble = procedimiento(x) { … }`.',
          );
        }
        this.begin('FunctionLiteral');
        return this.parseFunction(this.advance().span.start);
      case TokenType.INCREMENT:
      case TokenType.DECREMENT:
        if (this.peek().type === TokenType.IDENT) {
          const name = this.peek().lexeme;
          this.error(
            'INCREMENTO_EN_EXPRESIÓN',
            `En Codexivo \`${token.lexeme}\` va después del nombre de la variable.`,
            { start: token.span.start, end: this.peek().span.end },
            `Escribe \`${name}${token.lexeme}\` como una sentencia propia.`,
          );
        }
        this.incrementInExpression();
      case TokenType.ILLEGAL:
        throw new ParseFailure();
      case TokenType.IF:
      case TokenType.WHILE:
      case TokenType.FOR:
      case TokenType.DO:
      case TokenType.LET:
      case TokenType.CONST:
      case TokenType.DOMAIN:
      case TokenType.REPEAT:
      case TokenType.FOR_EACH:
      case TokenType.BREAK:
      case TokenType.CONTINUE:
      case TokenType.RETURN:
        this.error(
          'SENTENCIA_EN_EXPRESIÓN',
          `${describeToken(token)} empieza una sentencia y no se puede usar dentro de una expresión.`,
          token.span,
        );
      case TokenType.EOF:
        this.error(
          'EXPRESIÓN_INCOMPLETA',
          'El programa terminó a mitad de una expresión.',
          token.span,
          'Revisa que no falte un valor al final.',
        );
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
        this.begin('Call', left);
        this.advance();
        const args = this.parseList_(TokenType.RPAREN, 'para cerrar los argumentos');
        return this.finish({ kind: 'Call', id: this.id(), callee: left, args, span: this.spanFrom(start) });
      }
      case TokenType.LBRACKET: {
        this.begin('Index', left);
        this.advance();
        if (this.check(TokenType.RBRACKET)) {
          this.error(
            'ÍNDICE_VACÍO',
            'Falta el índice entre los corchetes.',
            this.current.span,
            'Por ejemplo: `lista[0]`.',
          );
        }
        const index = this.grouped(() => this.parseExpression());
        this.expect(TokenType.RBRACKET, 'para cerrar el índice');
        return this.finish({ kind: 'Index', id: this.id(), object: left, index, span: this.spanFrom(start) });
      }
      case TokenType.DOT: {
        this.begin('Index', left);
        this.advance();
        const property = this.current;
        if (property.type !== TokenType.IDENT) {
          this.failSilentlyOnIllegal();
          // Una palabra reservada como `si` no debe empezar otra sentencia al recuperarse del error.
          if (property.type !== TokenType.EOF) this.advance();
          this.error(
            'CAMPO_ESPERADO',
            `Después de \`.\` va el nombre de un campo, pero se encontró ${describeToken(property)}.`,
            property.span,
            'Con `.` solo se usan claves que son nombres válidos; para las demás escribe `d["clave"]`.',
          );
        }
        const index = this.leaf<ast.StringLiteral>('StringLiteral', (_, id) => ({
          kind: 'StringLiteral',
          id,
          value: property.lexeme,
          span: property.span,
        }));
        return this.finish({
          kind: 'Index',
          id: this.id(),
          object: left,
          index,
          dot: true,
          span: this.spanFrom(start),
        });
      }
      case TokenType.AND:
      case TokenType.OR: {
        this.begin('Logical', left);
        this.advance();
        const precedence = INFIX_PRECEDENCE[token.type]!;
        const right = this.parseExpression(precedence, false, token);
        const operator = token.type === TokenType.AND ? 'y' : 'o';
        return this.finish({ kind: 'Logical', id: this.id(), operator, left, right, span: this.spanFrom(start) });
      }
      default: {
        this.begin('Binary', left);
        this.advance();
        const precedence = INFIX_PRECEDENCE[token.type]!;
        // `^` es asociativo a la derecha: `2 ^ 3 ^ 2` es `2 ^ (3 ^ 2)`.
        const right = this.parseExpression(precedence === Precedence.POWER ? precedence - 1 : precedence, false, token);
        const operator = BINARY_OPERATORS[token.type]!;
        if (precedence === Precedence.COMPARE && INFIX_PRECEDENCE[this.current.type] === Precedence.COMPARE) {
          this.error(
            'COMPARACIÓN_ENCADENADA',
            'No se pueden encadenar comparaciones.',
            { start, end: this.current.span.end },
            'Une las dos comparaciones con `y`, por ejemplo: `1 < x y x < 5`.',
          );
        }
        return this.finish({ kind: 'Binary', id: this.id(), operator, left, right, span: this.spanFrom(start) });
      }
    }
  }

  private parseList(): ast.ListLiteral {
    this.begin('ListLiteral');
    const start = this.advance().span.start;
    const elements = this.parseList_(TokenType.RBRACKET, 'para cerrar la lista');
    return this.finish({ kind: 'ListLiteral', id: this.id(), elements, span: this.spanFrom(start) });
  }

  private parseDict(): ast.DictLiteral {
    this.begin('DictLiteral');
    const open = this.advance();
    const entries: ast.DictEntry[] = [];
    const literalKeys = new Set<string | number>();
    while (!this.check(TokenType.RBRACE)) {
      const entryStart = this.current.span.start;
      if (this.check(TokenType.IDENT) && this.peek().type === TokenType.COLON) {
        this.error(
          'CLAVE_SIN_COMILLAS',
          `La clave \`${this.current.lexeme}\` necesita comillas.`,
          this.current.span,
          `Escribe \`"${this.current.lexeme}": …\`. Si querías usar el valor de una variable como clave, ponla entre paréntesis: \`(${this.current.lexeme}): …\`.`,
        );
      }
      const key = this.grouped(() => this.parseExpression());
      this.expect(TokenType.COLON, 'después de la clave', 'Cada elemento de un diccionario se escribe `clave: valor`.');
      const value = this.grouped(() => this.parseExpression());
      if (key.kind === 'StringLiteral' || key.kind === 'NumberLiteral') {
        if (literalKeys.has(key.value)) {
          this.error('CLAVE_REPETIDA', `La clave ${describeKey(key.value)} está repetida.`, key.span);
        }
        literalKeys.add(key.value);
        if (value.kind === 'FunctionLiteral' && !value.name && key.kind === 'StringLiteral') value.name = key.value;
      }
      entries.push({ key, value, span: this.spanFrom(entryStart) });
      if (!this.match(TokenType.COMMA)) break;
    }
    if (!this.check(TokenType.RBRACE)) {
      this.failSilentlyOnIllegal();
      this.error(
        'TOKEN_ESPERADO',
        `Se esperaba \`,\` o \`}\` en el diccionario que empieza en la línea ${open.span.start.line}, pero se encontró ${describeToken(this.current)}.`,
        this.current.span,
      );
    }
    this.advance();
    return this.finish({ kind: 'DictLiteral', id: this.id(), entries, span: this.spanFrom(open.span.start) });
  }

  /** Expresiones separadas por comas hasta `closing`. Se permite una coma final. */
  private parseList_(closing: TokenType, context: string): ast.Expression[] {
    const items: ast.Expression[] = [];
    while (!this.check(closing)) {
      items.push(this.grouped(() => this.parseExpression()));
      if (!this.match(TokenType.COMMA)) break;
    }
    this.expect(closing, context);
    return items;
  }

  private parseFunctionDeclaration(): ast.FunctionDeclaration {
    this.begin('FunctionDeclaration');
    const start = this.advance().span.start;
    const name = this.parseBindingName('después de `procedimiento`');
    this.begin('FunctionLiteral');
    const fn = this.parseFunction(start, name.name);
    return this.finish({ kind: 'FunctionDeclaration', id: this.id(), name, function: fn, span: fn.span });
  }

  /** Parámetros y cuerpo; `procedimiento` (y el nombre, si lo hay) ya se leyeron y el nodo ya empezó (`begin`). */
  private parseFunction(start: Position, name?: string): ast.FunctionLiteral {
    this.expect(
      TokenType.LPAREN,
      'después de `procedimiento`',
      'Los parámetros van entre paréntesis: `procedimiento(a, b) { … }`.',
    );
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
    // `romper` y `continuar` no cruzan los límites de un procedimiento.
    const loopDepth = this.loopDepth;
    this.loopDepth = 0;
    let body: ast.Block;
    try {
      body = this.parseBlock('para el cuerpo del procedimiento');
    } finally {
      this.loopDepth = loopDepth;
    }
    return this.finish({ kind: 'FunctionLiteral', id: this.id(), name, params, body, span: this.spanFrom(start) });
  }
}

const describeKey = (key: string | number): string => (typeof key === 'string' ? JSON.stringify(key) : String(key));
