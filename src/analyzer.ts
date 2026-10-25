import type { ErrorInfo } from './errors';
import { flowGraph } from './flow';
import type { FlowGraph, FlowOptions } from './flow';
import { constants, natives } from './runtime/builtins';
import { libraryProcedures } from './runtime/prelude';
import { suggestName } from './runtime/suggest';
import { describeType } from './runtime/values';
import type { NativeValue, TypeName } from './runtime/values';
import type * as ast from './syntax/ast';
import { parse } from './syntax/parser';
import type { Span, Token } from './syntax/token';
import { createWorld, EXAMPLE_WORLD } from './world';
import type { WorldDefinition } from './world';

/**
 * Análisis estático: lo que se puede saber de un programa sin ejecutarlo. Recorre el AST con las mismas reglas de
 * alcance que el compilador y la máquina (procedimientos con nombre desde el inicio de su bloque, variables desde su
 * declaración, alcance por bloque) y produce:
 *
 * - `diagnostics`: errores que la máquina daría al llegar a esa línea (nombres que no existen, constantes reasignadas,
 *   cantidad de argumentos…), con el mismo `code` y el mismo mensaje, para que el editor los muestre antes de ejecutar;
 * - `symbols`: cada nombre que declara el programa, dónde se declara, en qué alcance se ve y cada uso.
 *
 * Nunca inventa un error que la máquina no daría: cuando no puede saberlo (un procedimiento que usa una variable
 * global declarada más abajo), calla. Un aviso falso le cuesta más a quien aprende que un aviso que falta.
 */

export type DiagnosticSeverity = 'error' | 'advertencia' | 'sugerencia';

/** Un aviso del análisis. `error` es algo que la máquina rechazaría al ejecutar esa línea. */
export interface Diagnostic extends ErrorInfo {
  kind: 'análisis';
  severity: DiagnosticSeverity;
  span: Span;
}

export type SymbolKind = 'variable' | 'constante' | 'procedimiento' | 'parámetro' | 'dominio';

export interface SymbolReference {
  /** El `Identifier` (o el campo `dominio.miembro`) que usa el nombre. */
  nodeId: number;
  span: Span;
  /** `lectura` (`x`), `escritura` (`x = …`) o `actualización` (`x += 1`, `x++`). */
  kind: 'lectura' | 'escritura' | 'actualización';
}

export interface SymbolInfo {
  /** Posición en `symbols`. */
  id: number;
  name: string;
  kind: SymbolKind;
  /** El `Identifier` que lo declara. */
  nodeId: number;
  span: Span;
  /** Nodo que abre el alcance donde se ve: el programa, un bloque, un procedimiento, un dominio o un bucle. */
  scope: { nodeId: number; span: Span };
  /** Variable de `para … desde … hasta`: avanza sola y no se puede cambiar. */
  loop?: boolean;
  /** Procedimiento con nombre (o constante que guarda uno): sus parámetros. */
  params?: string[];
  /** Miembro de un dominio: `id` del símbolo del dominio. */
  domain?: number;
  /** Usos del nombre, en orden de aparición. La declaración no cuenta. */
  references: SymbolReference[];
}

export interface AnalyzeOptions {
  /** Modo mundo: existen `avanzar()`, `frente_libre()`… Acepta el mundo mismo o solo `true`. */
  world?: boolean | WorldDefinition;
  /** Procedimientos nativos adicionales, como `MachineOptions.natives`. Basta con el nombre y, si se sabe, `arity`. */
  natives?: Record<string, Pick<NativeValue, 'arity'> | undefined>;
  /** Variables que ya existen fuera del programa (las de ejecuciones anteriores en el REPL). */
  globals?: Iterable<string>;
  /** Permite volver a declarar una variable existente (como en el REPL). */
  allowRedeclare?: boolean;
  /**
   * `true` si el AST viene de un código con errores de sintaxis: el parser abandona lo que no entendió, así que una
   * declaración puede faltar. Se omiten entonces los avisos de nombres que no existen.
   */
  incomplete?: boolean;
}

export interface ProgramAnalysis {
  diagnostics: Diagnostic[];
  symbols: SymbolInfo[];
}

export interface AnalysisOptions extends AnalyzeOptions {
  /** Opciones del diagrama de flujo, o `false` para no generarlo. */
  flow?: FlowOptions | false;
}

/** Todo lo que un editor necesita para cada versión del código, sin ejecutarlo. */
export interface Analysis extends ProgramAnalysis {
  program: ast.Program;
  tokens: Token[];
  /** Errores léxicos y sintácticos. Con alguno, el AST es parcial y los diagnósticos de nombres se omiten. */
  errors: ErrorInfo[];
  /** Diagrama de flujo del programa (ver `flowGraph`), salvo con `flow: false`. */
  flow?: FlowGraph;
}

/** Analiza el código: tokens, AST, errores de sintaxis, diagnósticos, símbolos y diagrama en una sola pasada. */
export const analyze = (source: string, options: AnalysisOptions = {}): Analysis => {
  const { flow: flowOptions, ...rest } = options;
  const { program, tokens, errors } = parse(source);
  const { diagnostics, symbols } = analyzeProgram(program, { ...rest, incomplete: errors.length > 0 });
  const flow = flowOptions === false ? undefined : flowGraph(program, flowOptions ?? {});
  return {
    program,
    tokens,
    errors: errors.map(error => error.toJSON()),
    diagnostics,
    symbols,
    ...(flow ? { flow } : {}),
  };
};

/** Analiza un AST ya construido. */
export const analyzeProgram = (program: ast.Program, options: AnalyzeOptions = {}): ProgramAnalysis =>
  new Analyzer(options).run(program);

// ── implementación ───────────────────────────────────────────────────────────

/** Qué sabe el analizador de un nombre que no declara el programa. */
interface LibraryEntry {
  /** Nombre canónico (con acento), como lo nombra la máquina en sus mensajes. */
  name: string;
  arity?: NativeValue['arity'];
  /** Una constante de la biblioteca (`PI`): no se llama ni se le asigna. */
  constant?: TypeName;
}

interface Sym extends SymbolInfo {
  /** Un dominio: el alcance con sus miembros. */
  members?: StaticScope;
  domainSymbol?: Sym;
  /** Una constante con un valor literal: su tipo, para avisar si se intenta llamar. */
  valueType?: TypeName;
}

interface StaticScope {
  /** Nodo que abre el alcance. */
  node: ast.Node;
  parent?: StaticScope;
  kind: 'programa' | 'bloque' | 'procedimiento' | 'dominio';
  symbols: Map<string, Sym>;
  /** Variables y dominios que este alcance declara más abajo, para la pista «se declara en la línea…». */
  later: Map<string, ast.Identifier>;
}

type Resolution =
  | { kind: 'símbolo'; symbol: Sym }
  /** Una variable de fuera del programa (`globals`): existe, pero no se sabe nada de ella. */
  | { kind: 'global' }
  | { kind: 'biblioteca'; entry: LibraryEntry }
  | undefined;

/** Avisos que dependen de que el AST esté completo. */
const NEEDS_COMPLETE_AST = new Set(['NOMBRE_DESCONOCIDO', 'VARIABLE_NO_DECLARADA', 'MIEMBRO_INEXISTENTE']);

const plural = (count: number) => (count === 1 ? '1 valor' : `${count} valores`);

let worldNatives: Record<string, NativeValue> | undefined;

/** Los procedimientos del modo mundo son los mismos en cualquier mundo. */
const worldLibrary = (): Record<string, NativeValue> => (worldNatives ??= createWorld(EXAMPLE_WORLD).natives);

const literalType = (node: ast.Expression): TypeName | undefined => {
  switch (node.kind) {
    case 'NumberLiteral':
      return 'número';
    case 'StringLiteral':
      return 'texto';
    case 'BooleanLiteral':
      return 'lógico';
    case 'NullLiteral':
      return 'nulo';
    case 'ListLiteral':
      return 'lista';
    case 'DictLiteral':
      return 'diccionario';
    default:
      return undefined;
  }
};

/** `f` o `dominio.f`, como lo nombra la máquina en sus mensajes. */
const describeCallee = (node: ast.Call): string => {
  const { callee } = node;
  if (callee.kind === 'Identifier') return callee.name;
  if (
    callee.kind === 'Index' &&
    callee.dot &&
    callee.object.kind === 'Identifier' &&
    callee.index.kind === 'StringLiteral'
  )
    return `${callee.object.name}.${callee.index.value}`;
  return 'esto';
};

class Analyzer {
  private readonly diagnostics: Diagnostic[] = [];
  private readonly symbols: Sym[] = [];
  private readonly library = new Map<string, LibraryEntry>();
  private readonly globals: Set<string>;
  /** Cuerpos de procedimientos pendientes: se recorren al final, cuando los alcances de afuera están completos. */
  private readonly pending: Array<{ literal: ast.FunctionLiteral; parent: StaticScope }> = [];

  constructor(private readonly options: AnalyzeOptions) {
    const register = (table: Record<string, Pick<NativeValue, 'arity'> | undefined>) => {
      for (const [name, native] of Object.entries(table)) {
        if (native && !this.library.has(name)) {
          this.library.set(name, { name: 'name' in native ? (native as NativeValue).name : name, arity: native.arity });
        }
      }
    };
    register(options.natives ?? {});
    if (options.world) register(worldLibrary());
    register(natives);
    for (const [name, procedure] of Object.entries(libraryProcedures)) {
      if (this.library.has(name)) continue;
      const { chunk } = procedure;
      this.library.set(name, {
        name,
        arity: chunk.minParams !== undefined ? [chunk.minParams, chunk.params.length] : chunk.params.length,
      });
    }
    for (const name of Object.keys(constants)) {
      if (!this.library.has(name)) this.library.set(name, { name, constant: 'número' });
    }
    this.globals = new Set(options.globals ?? []);
  }

  run(program: ast.Program): ProgramAnalysis {
    const scope = this.scope(program, 'programa', program.statements);
    this.statements(program.statements, scope);
    // Cada cuerpo puede encolar más (procedimientos anidados); `for…of` sobre un arreglo ve los que se agregan.
    for (const { literal, parent } of this.pending) this.procedure(literal, parent);

    const byPosition = (a: { span: Span }, b: { span: Span }) => a.span.start.offset - b.span.start.offset;
    const symbols = [...this.symbols].sort(byPosition);
    const ids = new Map(symbols.map((symbol, index) => [symbol, index]));
    return {
      diagnostics: [...this.diagnostics].sort(byPosition),
      symbols: symbols.map((symbol, index) => {
        const { members, domainSymbol, valueType, ...info } = symbol;
        void members;
        void valueType;
        return { ...info, id: index, ...(domainSymbol ? { domain: ids.get(domainSymbol)! } : {}) };
      }),
    };
  }

  // ── alcances y símbolos ──────────────────────────────────────────────────

  private scope(
    node: ast.Node,
    kind: StaticScope['kind'],
    statements: ast.Statement[],
    parent?: StaticScope,
  ): StaticScope {
    const later = new Map<string, ast.Identifier>();
    for (const statement of statements) {
      if (statement.kind === 'VariableDeclaration' || statement.kind === 'Domain')
        later.set(statement.name.name, statement.name);
      if (statement.kind === 'For' && statement.init?.kind === 'VariableDeclaration')
        later.set(statement.init.name.name, statement.init.name);
    }
    return { node, parent, kind, symbols: new Map(), later };
  }

  private declare(
    scope: StaticScope,
    name: ast.Identifier,
    kind: SymbolKind,
    extra: Partial<Pick<Sym, 'loop' | 'params' | 'members' | 'valueType'>> = {},
  ): Sym {
    const existing = scope.symbols.get(name.name);
    // Un nombre repetido con un procedimiento ya lo señala el parser (`NOMBRE_REPETIDO`); los parámetros se
    // enlazan sin revisar, como en la máquina.
    if (
      existing &&
      !this.options.allowRedeclare &&
      existing.kind !== 'procedimiento' &&
      kind !== 'procedimiento' &&
      kind !== 'parámetro'
    ) {
      if (kind === 'dominio') {
        this.report(
          'VARIABLE_REPETIDA',
          `Ya existe algo llamado \`${name.name}\` en este bloque.`,
          name.span,
          'Cada dominio necesita un nombre propio en su bloque.',
        );
      } else {
        this.report(
          'VARIABLE_REPETIDA',
          `La variable \`${name.name}\` ya existe en este bloque.`,
          name.span,
          `Para cambiar su valor escribe \`${name.name} = …\`, sin \`variable\`.`,
        );
      }
    }
    scope.later.delete(name.name);
    const symbol: Sym = {
      id: this.symbols.length,
      name: name.name,
      kind,
      nodeId: name.id,
      span: name.span,
      scope: { nodeId: scope.node.id, span: scope.node.span },
      references: [],
      ...(extra.loop ? { loop: true } : {}),
      ...(extra.params ? { params: extra.params } : {}),
      ...(extra.members ? { members: extra.members } : {}),
      ...(extra.valueType ? { valueType: extra.valueType } : {}),
    };
    this.symbols.push(symbol);
    scope.symbols.set(name.name, symbol);
    return symbol;
  }

  /** El símbolo de un dominio se crea después que sus miembros; aquí se enlazan con él. */
  private adopt(domain: Sym, members: StaticScope): void {
    for (const symbol of this.symbols) {
      if (symbol.scope.nodeId === members.node.id) symbol.domainSymbol = domain;
    }
  }

  private lookup(name: string, scope: StaticScope | undefined): Resolution {
    for (let current = scope; current; current = current.parent) {
      const symbol = current.symbols.get(name);
      if (symbol) return { kind: 'símbolo', symbol };
    }
    if (this.globals.has(name)) return { kind: 'global' };
    const entry = this.library.get(name);
    return entry ? { kind: 'biblioteca', entry } : undefined;
  }

  /** Una declaración más abajo en un alcance visible, si la hay: explica por qué el nombre todavía no existe. */
  private declaredLater(name: string, scope: StaticScope | undefined, from: Span): ast.Identifier | undefined {
    for (let current = scope; current; current = current.parent) {
      const later = current.later.get(name);
      if (later && later.span.start.offset > from.start.offset) return later;
    }
    return undefined;
  }

  private visibleNames(scope: StaticScope | undefined): string[] {
    const names: string[] = [...this.library.keys(), ...this.globals];
    for (let current = scope; current; current = current.parent) names.push(...current.symbols.keys());
    return names;
  }

  private report(code: string, message: string, span: Span, hint?: string): void {
    if (this.options.incomplete && NEEDS_COMPLETE_AST.has(code)) return;
    this.diagnostics.push({ kind: 'análisis', severity: 'error', code, message, ...(hint ? { hint } : {}), span });
  }

  // ── usos ────────────────────────────────────────────────────────────────

  /** Un nombre que se lee (`x`, `f(…)`). */
  private read(node: ast.Identifier, scope: StaticScope): Resolution {
    const found = this.lookup(node.name, scope);
    if (found?.kind === 'símbolo') {
      found.symbol.references.push({ nodeId: node.id, span: node.span, kind: 'lectura' });
    } else if (!found) {
      const later = this.declaredLater(node.name, scope, node.span);
      const suggestion = later ? undefined : suggestName(node.name, this.visibleNames(scope));
      this.report(
        'NOMBRE_DESCONOCIDO',
        `No existe nada llamado \`${node.name}\`.`,
        node.span,
        later
          ? `\`${node.name}\` se declara más abajo, en la línea ${later.span.start.line}; una variable existe desde su declaración.`
          : suggestion
            ? `¿Quisiste decir \`${suggestion}\`?`
            : `Si es una variable nueva, declárala con \`variable ${node.name} = …\`.`,
      );
    }
    return found;
  }

  /** Un nombre al que se le asigna (`x = …`, `x += …`, `x++`). */
  private write(node: ast.Identifier, scope: StaticScope, kind: 'escritura' | 'actualización', owner: ast.Node): void {
    const found = this.lookup(node.name, scope);
    if (found?.kind === 'símbolo') {
      const { symbol } = found;
      symbol.references.push({ nodeId: node.id, span: node.span, kind });
      if (symbol.loop) {
        this.report(
          'VARIABLE_DE_PARA',
          `La variable de un \`para\` avanza sola; \`${node.name}\` no se puede cambiar dentro del bucle.`,
          owner.span,
          `Si necesitas otro valor, guárdalo en una variable nueva: \`variable otro = ${node.name} + 1\`.`,
        );
      } else if (symbol.kind === 'dominio') {
        this.report(
          'CONSTANTE_REASIGNADA',
          `\`${node.name}\` es un dominio; su nombre no se puede usar para otra cosa.`,
          owner.span,
          `Para cambiar un miembro escribe \`${node.name}.miembro = …\`; para otro valor, usa otro nombre.`,
        );
      } else if (symbol.kind === 'constante') {
        this.report(
          'CONSTANTE_REASIGNADA',
          `\`${node.name}\` es una constante; su valor no puede cambiar.`,
          owner.span,
          `Si necesitas cambiarlo, declárala con \`variable ${node.name} = …\` en lugar de \`constante\`.`,
        );
      }
      return;
    }
    if (found?.kind === 'global') return;
    if (found?.kind === 'biblioteca') {
      const what = found.entry.constant ? 'una constante' : 'un procedimiento';
      this.report(
        'NOMBRE_RESERVADO_POR_BIBLIOTECA',
        `\`${node.name}\` es ${what} de Codexivo; no se le puede asignar un valor.`,
        node.span,
        `Si quieres tu propia variable con ese nombre, declárala: \`variable ${node.name} = …\`.`,
      );
      return;
    }
    const later = this.declaredLater(node.name, scope, node.span);
    this.report(
      'VARIABLE_NO_DECLARADA',
      `La variable \`${node.name}\` no existe.`,
      node.span,
      later
        ? `\`${node.name}\` se declara más abajo, en la línea ${later.span.start.line}; una variable existe desde su declaración.`
        : `¿Olvidaste declararla? Escribe \`variable ${node.name} = …\` la primera vez.`,
    );
  }

  /** El dominio al que se refiere una expresión (`calc` o `geo.figuras`), si se sabe sin ejecutar. */
  private domainOf(node: ast.Expression, scope: StaticScope): Sym | undefined {
    if (node.kind === 'Identifier') {
      const found = this.lookup(node.name, scope);
      return found?.kind === 'símbolo' && found.symbol.members ? found.symbol : undefined;
    }
    if (node.kind === 'Index' && node.dot && node.index.kind === 'StringLiteral') {
      const member = this.domainOf(node.object, scope)?.members?.symbols.get(node.index.value);
      return member?.members ? member : undefined;
    }
    return undefined;
  }

  /** `dominio.miembro`: revisa que exista y, al asignar, que se pueda cambiar desde fuera. */
  private member(node: ast.Index, scope: StaticScope, kind: SymbolReference['kind']): Sym | undefined {
    if (!node.dot || node.index.kind !== 'StringLiteral') return undefined;
    const domain = this.domainOf(node.object, scope);
    if (!domain) return undefined;
    const name = node.index.value;
    const member = domain.members!.symbols.get(name);
    if (!member) {
      const suggestion = suggestName(name, domain.members!.symbols.keys());
      this.report(
        'MIEMBRO_INEXISTENTE',
        `El dominio \`${domain.name}\` no tiene nada llamado \`${name}\`.`,
        node.index.span,
        suggestion
          ? `¿Quisiste decir \`${domain.name}.${suggestion}\`?`
          : 'Los miembros de un dominio se declaran dentro de sus llaves; desde fuera no se pueden agregar.',
      );
      return undefined;
    }
    member.references.push({ nodeId: node.index.id, span: node.index.span, kind });
    if (kind !== 'lectura' && member.kind !== 'variable') {
      this.report(
        'MIEMBRO_DE_SOLO_LECTURA',
        `\`${domain.name}.${name}\` no se puede cambiar desde fuera del dominio.`,
        node.span,
        'Desde fuera de un dominio solo se cambian sus miembros declarados con `variable`; las constantes, los procedimientos y los dominios que contiene quedan fijos.',
      );
    }
    return member;
  }

  private call(node: ast.Call, scope: StaticScope): void {
    const { callee } = node;
    let target: Resolution;
    if (callee.kind === 'Identifier') {
      target = this.read(callee, scope);
    } else {
      this.expression(callee.kind === 'Index' ? callee.object : callee, scope);
      if (callee.kind === 'Index') {
        this.expression(callee.index, scope);
        const member = this.member(callee, scope, 'lectura');
        target = member ? { kind: 'símbolo', symbol: member } : undefined;
      }
    }
    for (const argument of node.args) this.expression(argument, scope);

    if (!target) return;
    // La máquina nombra al procedimiento por su nombre propio (`suma`, `máximo`), no por cómo se escribió la llamada.
    const name =
      target.kind === 'símbolo'
        ? target.symbol.name
        : target.kind === 'biblioteca'
          ? target.entry.name
          : describeCallee(node);
    let expected: NativeValue['arity'] | undefined;
    let notCallable: TypeName | undefined;
    let declaration: Sym | undefined;
    if (target.kind === 'símbolo') {
      const { symbol } = target;
      if (symbol.params) {
        expected = symbol.params.length;
        declaration = symbol;
      } else if (symbol.kind === 'dominio') notCallable = 'dominio';
      else if (symbol.kind === 'constante' && symbol.valueType) notCallable = symbol.valueType;
    } else if (target.kind === 'biblioteca') {
      if (target.entry.constant) notCallable = target.entry.constant;
      else expected = target.entry.arity;
    }
    if (notCallable) {
      this.report(
        'NO_ES_PROCEDIMIENTO',
        `\`${name}\` no es un procedimiento, es ${describeType(notCallable)}.`,
        callee.span,
      );
      return;
    }
    if (expected === undefined) return;
    const received = node.args.length;
    const [min, max] = typeof expected === 'number' ? [expected, expected] : expected;
    if (received >= min && received <= max) return;
    let wanted: string;
    if (min === max) wanted = plural(min);
    else if (max === Infinity) wanted = `al menos ${plural(min)}`;
    else wanted = `entre ${min} y ${plural(max)}`;
    this.report(
      'CANTIDAD_DE_ARGUMENTOS',
      `\`${name}\` espera ${wanted}, pero recibió ${received}.`,
      node.span,
      declaration
        ? `Se declaró como \`procedimiento ${declaration.name}(${declaration.params!.join(', ')})\` en la línea ${declaration.span.start.line}.`
        : undefined,
    );
  }

  // ── recorrido ───────────────────────────────────────────────────────────

  /** Las sentencias de un alcance. Los procedimientos con nombre existen desde el inicio. */
  private statements(list: ast.Statement[], scope: StaticScope): void {
    for (const statement of list) {
      if (statement.kind !== 'FunctionDeclaration') continue;
      this.declare(scope, statement.name, 'procedimiento', {
        params: statement.function.params.map(param => param.name),
      });
    }
    for (const statement of list) this.statement(statement, scope);
  }

  private block(node: ast.Block, parent: StaticScope): void {
    this.statements(node.statements, this.scope(node, 'bloque', node.statements, parent));
  }

  private statement(node: ast.Statement, scope: StaticScope): void {
    switch (node.kind) {
      case 'VariableDeclaration': {
        // El valor se evalúa antes de que exista la variable: `variable x = x + 1` usa la `x` de afuera.
        this.expression(node.value, scope);
        const literal = node.value.kind === 'FunctionLiteral' ? node.value : undefined;
        this.declare(scope, node.name, node.constant ? 'constante' : 'variable', {
          ...(node.constant && literal ? { params: literal.params.map(param => param.name) } : {}),
          ...(node.constant ? { valueType: literalType(node.value) } : {}),
        });
        return;
      }
      case 'FunctionDeclaration':
        this.pending.push({ literal: node.function, parent: scope });
        return;
      case 'Assignment':
      case 'Increment':
        this.assignment(node, scope);
        return;
      case 'ExpressionStatement':
        this.expression(node.expression, scope);
        return;
      case 'Return':
        if (node.value) this.expression(node.value, scope);
        return;
      case 'Block':
        this.block(node, scope);
        return;
      case 'If':
        for (const branch of node.branches) {
          this.expression(branch.condition, scope);
          this.block(branch.body, scope);
        }
        if (node.alternative) this.block(node.alternative, scope);
        return;
      case 'While':
        this.expression(node.condition, scope);
        this.block(node.body, scope);
        return;
      case 'DoUntil':
        this.block(node.body, scope);
        this.expression(node.condition, scope);
        return;
      case 'For': {
        const inner = this.scope(node, 'bloque', node.init ? [node.init] : [], scope);
        if (node.init) this.statement(node.init, inner);
        if (node.condition) this.expression(node.condition, inner);
        this.block(node.body, inner);
        if (node.update) this.statement(node.update, inner);
        return;
      }
      case 'Repeat':
        this.expression(node.count, scope);
        this.block(node.body, scope);
        return;
      case 'ForRange': {
        this.expression(node.from, scope);
        this.expression(node.to, scope);
        if (node.step) this.expression(node.step, scope);
        // La variable es nueva en cada vuelta y comparte alcance con el cuerpo, como en el compilador.
        const inner = this.scope(node, 'bloque', node.body.statements, scope);
        this.declare(inner, node.variable, 'variable', { loop: true });
        this.statements(node.body.statements, inner);
        return;
      }
      case 'ForEach': {
        this.expression(node.iterable, scope);
        const inner = this.scope(node, 'bloque', node.body.statements, scope);
        this.declare(inner, node.variable, 'variable');
        if (node.value) this.declare(inner, node.value, 'variable');
        this.statements(node.body.statements, inner);
        return;
      }
      case 'Domain': {
        const members = this.scope(node, 'dominio', node.body.statements, scope);
        this.statements(node.body.statements, members);
        // El nombre del dominio existe después de su bloque, en el alcance de afuera.
        const domain = this.declare(scope, node.name, 'dominio', { members });
        this.adopt(domain, members);
        return;
      }
      case 'Break':
      case 'Continue':
        return;
    }
  }

  private assignment(node: ast.Assignment | ast.Increment, scope: StaticScope): void {
    const kind: SymbolReference['kind'] =
      node.kind === 'Increment' || node.operator !== '=' ? 'actualización' : 'escritura';
    if (node.kind === 'Assignment') this.expression(node.value, scope);
    const { target } = node;
    if (target.kind === 'Identifier') {
      this.write(target, scope, kind, node);
      return;
    }
    this.expression(target.object, scope);
    this.expression(target.index, scope);
    this.member(target, scope, kind);
  }

  private expression(node: ast.Expression, scope: StaticScope): void {
    switch (node.kind) {
      case 'NumberLiteral':
      case 'StringLiteral':
      case 'BooleanLiteral':
      case 'NullLiteral':
        return;
      case 'ListLiteral':
        for (const element of node.elements) this.expression(element, scope);
        return;
      case 'DictLiteral':
        for (const entry of node.entries) {
          this.expression(entry.key, scope);
          this.expression(entry.value, scope);
        }
        return;
      case 'Identifier':
        this.read(node, scope);
        return;
      case 'Unary':
        this.expression(node.operand, scope);
        return;
      case 'Binary':
      case 'Logical':
        this.expression(node.left, scope);
        this.expression(node.right, scope);
        return;
      case 'Call':
        this.call(node, scope);
        return;
      case 'Index':
        this.expression(node.object, scope);
        this.expression(node.index, scope);
        this.member(node, scope, 'lectura');
        return;
      case 'FunctionLiteral':
        this.pending.push({ literal: node, parent: scope });
        return;
    }
  }

  /** El cuerpo de un procedimiento: los parámetros comparten alcance con el cuerpo. */
  private procedure(literal: ast.FunctionLiteral, parent: StaticScope): void {
    const scope = this.scope(literal, 'procedimiento', literal.body.statements, parent);
    for (const param of literal.params) this.declare(scope, param, 'parámetro');
    this.statements(literal.body.statements, scope);
  }
}
