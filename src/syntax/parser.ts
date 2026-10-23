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
      this.errors.push(
        new CodexivoError({
          kind: 'sintaxis',
          code: 'NOMBRE_REPETIDO',
          message: `Ya hay un procedimiento llamado \`${name.name}\` en este bloque.`,
          hint: 'Un procedimiento con nombre existe desde el inicio de su bloque; cambia uno de los dos nombres.',
          span: name.span,
        }),
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
    return {
      kind: 'VariableDeclaration',
      id: this.id(),
      constant,
      name,
      value,
      span: this.spanFrom(keyword.span.start),
    };
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
    this.advance();
    return { kind: 'Identifier', id: this.id(), name: token.lexeme, span: token.span };
  }

  /** Asignación (`x = …`, `lista[i] += …`), incremento (`i++`) o expresión. */
  private parseSimpleStatement(): ast.Assignment | ast.Increment | ast.ExpressionStatement {
    const start = this.current.span.start;
    const expression = this.parseExpression(Precedence.LOWEST, true);
    const operator = ASSIGNMENT_OPERATORS[this.current.type];
    const increment = INCREMENT_OPERATORS[this.current.type];
    if (!operator && !increment) {
      return { kind: 'ExpressionStatement', id: this.id(), expression, span: this.spanFrom(start) };
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
    this.advance();
    if (increment) {
      return { kind: 'Increment', id: this.id(), target: expression, operator: increment, span: this.spanFrom(start) };
    }
    const value = this.parseExpression();
    if (value.kind === 'FunctionLiteral' && !value.name && expression.kind === 'Identifier') {
      value.name = expression.name;
    }
    return {
      kind: 'Assignment',
      id: this.id(),
      target: expression,
      operator: operator!,
      value,
      span: this.spanFrom(start),
    };
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
    return { kind: 'If', id: this.id(), branches, alternative, span: this.spanFrom(start) };
  }

  private parseWhile(): ast.While {
    const start = this.advance().span.start;
    const condition = this.parseCondition('mientras');
    const body = this.parseLoopBody('después de la condición de `mientras`');
    return { kind: 'While', id: this.id(), condition, body, span: this.spanFrom(start) };
  }

  private parseDoUntil(): ast.DoUntil {
    const start = this.advance().span.start;
    const body = this.parseLoopBody('después de `hacer`');
    this.expect(
      TokenType.UNTIL,
      'después del bloque de `hacer`',
      'La forma completa es `hacer { … } hasta_que (condición)`.',
    );
    const condition = this.parseCondition('hasta_que');
    return { kind: 'DoUntil', id: this.id(), body, condition, span: this.spanFrom(start) };
  }

  private parseFor(): ast.For | ast.ForRange {
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
    return { kind: 'For', id: this.id(), init, condition, update, body, span: this.spanFrom(start) };
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
    return { kind: 'ForRange', id: this.id(), variable, from, to, step, body, span: this.spanFrom(start) };
  }

  private parseRepeat(): ast.Repeat {
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
    return { kind: 'Repeat', id: this.id(), count, body, span: this.spanFrom(keyword.span.start) };
  }

  private parseDomain(): ast.Domain {
    const keyword = this.advance();
    const name = this.parseBindingName('después de `dominio`');
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
      if (DOMAIN_MEMBERS.has(statement.kind) || this.errors.length >= MAX_ERRORS) continue;
      this.errors.push(
        new CodexivoError({
          kind: 'sintaxis',
          code: 'DOMINIO_SOLO_DECLARACIONES',
          message: printStart(statement)
            ? `Un dominio solo agrupa declaraciones, y \`${printStart(statement)}\` no es una.`
            : 'Un dominio solo agrupa declaraciones, y esta sentencia no es una.',
          hint: 'Dentro de `dominio` van `variable`, `constante`, `procedimiento` u otro `dominio`. Lo demás va en un procedimiento o fuera del dominio.',
          span: statement.span,
        }),
      );
    }
    const body: ast.Block = { kind: 'Block', id: this.id(), statements, span: this.spanFrom(open.span.start) };
    return { kind: 'Domain', id: this.id(), name, body, span: this.spanFrom(keyword.span.start) };
  }

  private parseForEach(): ast.ForEach {
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
    return {
      kind: 'ForEach',
      id: this.id(),
      variable,
      value,
      iterable,
      body,
      span: this.spanFrom(keyword.span.start),
    };
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
    const token = this.advance();
    const kind = token.type === TokenType.BREAK ? 'Break' : 'Continue';
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
    return { kind, id: this.id(), span: token.span };
  }

  // ── expresiones ────────────────────────────────────────────────────────────

  /** `statement` indica que la expresión es una sentencia completa, donde `i++` sí está permitido. */
  private parseExpression(precedence: Precedence = Precedence.LOWEST, statement = false): ast.Expression {
    this.enter();
    let left = this.parsePrefix();
    while (precedence < (INFIX_PRECEDENCE[this.current.type] ?? Precedence.LOWEST)) {
      // Sin `;`, una línea que empieza con `-`, `(` o `[` es otra sentencia, no la continuación de la anterior.
      if (this.grouping === 0 && this.current.span.start.line > this.previous.span.end.line) break;
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
        const expression = this.grouped(() => this.parseExpression());
        this.expect(TokenType.RPAREN, 'para cerrar el paréntesis');
        return expression;
      }
      case TokenType.LBRACKET:
        return this.parseList();
      case TokenType.LBRACE:
        return this.parseDict();
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
        if (this.peek().type === TokenType.IDENT) {
          this.error(
            'PROCEDIMIENTO_CON_NOMBRE',
            'Un procedimiento con nombre es una sentencia; no puede ir dentro de una expresión.',
            this.peek().span,
            'Como valor, escríbelo sin nombre: `variable doble = procedimiento(x) { … }`.',
          );
        }
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
        this.advance();
        const args = this.parseList_(TokenType.RPAREN, 'para cerrar los argumentos');
        return { kind: 'Call', id: this.id(), callee: left, args, span: this.spanFrom(start) };
      }
      case TokenType.LBRACKET: {
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
        return { kind: 'Index', id: this.id(), object: left, index, span: this.spanFrom(start) };
      }
      case TokenType.DOT: {
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
        this.advance();
        const index: ast.StringLiteral = {
          kind: 'StringLiteral',
          id: this.id(),
          value: property.lexeme,
          span: property.span,
        };
        return { kind: 'Index', id: this.id(), object: left, index, dot: true, span: this.spanFrom(start) };
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
        // `^` es asociativo a la derecha: `2 ^ 3 ^ 2` es `2 ^ (3 ^ 2)`.
        const right = this.parseExpression(precedence === Precedence.POWER ? precedence - 1 : precedence);
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

  private parseDict(): ast.DictLiteral {
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
    return { kind: 'DictLiteral', id: this.id(), entries, span: this.spanFrom(open.span.start) };
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
    const start = this.advance().span.start;
    const name = this.parseBindingName('después de `procedimiento`');
    const fn = this.parseFunction(start, name.name);
    return { kind: 'FunctionDeclaration', id: this.id(), name, function: fn, span: fn.span };
  }

  /** Parámetros y cuerpo; `procedimiento` (y el nombre, si lo hay) ya se leyeron. */
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
    return { kind: 'FunctionLiteral', id: this.id(), name, params, body, span: this.spanFrom(start) };
  }
}

const describeKey = (key: string | number): string => (typeof key === 'string' ? JSON.stringify(key) : String(key));
