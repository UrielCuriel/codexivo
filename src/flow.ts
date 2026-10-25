import { assertNever } from './assert';
import type * as ast from './syntax/ast';
import type { Span } from './syntax/token';
import { printExpression, printStatement } from './printer';

/**
 * Diagrama de flujo generado desde el AST. Aquí se decide qué nodos y aristas existen; el sitio solo los
 * acomoda (con ELK o dagre) y los dibuja. Con los eventos `paso` y `decide` de la máquina (`nodeId`), el sitio
 * sabe qué nodo iluminar: cada `nodeId` que emite la ejecución aparece en `astIds` de algún nodo del grafo.
 */

export type FlowNodeKind = 'inicio' | 'fin' | 'proceso' | 'decisión' | 'llamada' | 'entrada' | 'salida' | 'retorno';

export interface FlowNode {
  id: string;
  /**
   * Clave estable entre versiones del código: la ruta de la sentencia en el árbol (`2`, `2.c.0`, `2.r1.3`), no un
   * número de nodo. Mientras se escribe dentro de una sentencia su nodo conserva la clave, y al insertar una sentencia
   * solo cambian las que le siguen en su bloque. Sirve para animar el diagrama entre un análisis y el siguiente.
   */
  key: string;
  kind: FlowNodeKind;
  /** Texto corto para mostrar, generado desde el AST. Si se agruparon sentencias, una por línea. */
  label: string;
  /** Nodos del AST que representa: la sentencia y, en una decisión, también su condición. */
  astIds: number[];
  spans: Span[];
  /** Orden sugerido para acomodar el grafo: distancia desde el inicio sin contar las vueltas de los bucles. */
  rank: number;
  /** En una llamada a un procedimiento del programa: su nombre, para enlazar con `procedures`. */
  procedure?: string;
}

/**
 * - `normal`: sigue a la siguiente sentencia (o entra o sale de un bucle);
 * - `vuelta`: regresa al inicio de un bucle;
 * - `romper`, `continuar`, `regresa`: saltos explícitos.
 */
export type FlowEdgeKind = 'normal' | 'vuelta' | 'romper' | 'continuar' | 'regresa';

/** Etiqueta de una arista que sale de una decisión. */
export type FlowEdgeLabel = 'sí' | 'no' | 'repetir' | 'salir';

export interface FlowEdge {
  id: string;
  from: string;
  to: string;
  kind: FlowEdgeKind;
  label?: FlowEdgeLabel;
}

export interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
  /** Con `expandProcedures`, el grafo de cada procedimiento con nombre del programa. */
  procedures?: Array<{ name: string; astId: number; graph: FlowGraph }>;
}

export interface FlowOptions {
  /** Junta sentencias simples consecutivas (asignaciones, declaraciones) en un solo nodo de proceso. */
  group?: boolean;
  /** Genera también el grafo de cada procedimiento con nombre y marca las llamadas a ellos. */
  expandProcedures?: boolean;
  /** Recorta las etiquetas largas a esta cantidad de caracteres, con `…`. Por defecto no se recortan. */
  maxLabelLength?: number;
}

interface Pending {
  from: string;
  kind?: FlowEdgeKind;
  label?: FlowEdgeLabel;
}

interface Loop {
  breaks: Pending[];
  continues: Pending[];
}

const INPUT = new Set(['leer', 'leer_número', 'leer_numero']);
const OUTPUT = new Set(['imprimir']);

/** `f` o `dominio.f`: la ruta de un nombre, si la expresión es solo eso. */
const path = (node: ast.Expression): string | undefined => {
  if (node.kind === 'Identifier') return node.name;
  if (node.kind === 'Index' && node.dot && node.index.kind === 'StringLiteral') {
    const object = path(node.object);
    return object && `${object}.${node.index.value}`;
  }
  return undefined;
};

/** Nombre (o ruta) del procedimiento al que llama una expresión, si es una llamada directa. */
const calledName = (node: ast.Expression | undefined): string | undefined =>
  node?.kind === 'Call' ? path(node.callee) : undefined;

/**
 * La clave de cada nodo del AST que puede encabezar un nodo del grafo: la ruta de la sentencia (`0`, `0.c.1`…). Las
 * sentencias de un cuerpo llevan `c`; las ramas de un `si`, `r0`, `r1`… y `si_no`; el inicio y la actualización de un
 * `para`, `i` y `u`. La condición de un `para` y las de `pero_si` llevan la clave de su sentencia o rama.
 */
const keysOf = (statements: ast.Statement[]): Map<number, string> => {
  const keys = new Map<number, string>();
  const visit = (list: ast.Statement[], prefix: string) => {
    list.forEach((statement, index) => {
      const key = `${prefix}${index}`;
      keys.set(statement.id, key);
      switch (statement.kind) {
        case 'If':
          statement.branches.forEach((branch, branchIndex) => {
            keys.set(branch.condition.id, `${key}.r${branchIndex}`);
            visit(branch.body.statements, `${key}.r${branchIndex}.`);
          });
          if (statement.alternative) visit(statement.alternative.statements, `${key}.si_no.`);
          return;
        case 'For':
          if (statement.init) keys.set(statement.init.id, `${key}.i`);
          if (statement.condition) keys.set(statement.condition.id, key);
          if (statement.update) keys.set(statement.update.id, `${key}.u`);
          visit(statement.body.statements, `${key}.c.`);
          return;
        case 'Block':
        case 'While':
        case 'DoUntil':
        case 'Repeat':
        case 'ForRange':
        case 'ForEach':
          visit(statement.kind === 'Block' ? statement.statements : statement.body.statements, `${key}.c.`);
          return;
        default:
          return;
      }
    });
  };
  visit(statements, '');
  return keys;
};

class Builder {
  readonly nodes: FlowNode[] = [];
  readonly edges: FlowEdge[] = [];
  private readonly loops: Loop[] = [];
  private readonly returns: Pending[] = [];
  /** Último nodo de proceso, al que se le pueden juntar sentencias con `group`. */
  private groupable?: string;

  constructor(
    private readonly options: FlowOptions,
    private readonly procedures: Set<string>,
    private readonly keys: Map<number, string>,
  ) {}

  private label(text: string): string {
    const max = this.options.maxLabelLength;
    return max && text.length > max ? `${text.slice(0, Math.max(1, max - 1))}…` : text;
  }

  node(kind: FlowNodeKind, label: string, astNodes: Array<{ id: number; span: Span }>): string {
    const id = `n${this.nodes.length}`;
    const first = astNodes[0];
    const key = kind === 'inicio' || kind === 'fin' ? kind : first ? (this.keys.get(first.id) ?? id) : id;
    this.nodes.push({
      id,
      key,
      kind,
      label: this.label(label),
      astIds: astNodes.map(node => node.id),
      spans: astNodes.map(node => node.span),
      rank: 0,
    });
    this.groupable = undefined;
    return id;
  }

  connect(pending: Pending[], to: string): void {
    for (const { from, kind = 'normal', label } of pending) {
      this.edges.push({ id: `e${this.edges.length}`, from, to, kind, ...(label ? { label } : {}) });
    }
  }

  /** Un nodo simple con sus aristas de entrada; regresa la arista pendiente que sale de él. */
  private simple(kind: FlowNodeKind, statement: ast.Statement, incoming: Pending[], procedure?: string): Pending[] {
    const groupable = kind === 'proceso' && this.options.group;
    const last = this.groupable ? this.nodes.find(node => node.id === this.groupable) : undefined;
    if (groupable && last && incoming.length === 1 && incoming[0]!.from === last.id && !incoming[0]!.label) {
      last.label = `${last.label}\n${this.label(printStatement(statement))}`;
      last.astIds.push(statement.id);
      last.spans.push(statement.span);
      return incoming;
    }
    const id = this.node(kind, printStatement(statement), [statement]);
    if (procedure) this.nodes[this.nodes.length - 1]!.procedure = procedure;
    this.connect(incoming, id);
    if (groupable) this.groupable = id;
    return [{ from: id }];
  }

  private kindOf(statement: ast.Statement): { kind: FlowNodeKind; procedure?: string } {
    const expression =
      statement.kind === 'ExpressionStatement'
        ? statement.expression
        : statement.kind === 'VariableDeclaration' || statement.kind === 'Assignment'
          ? statement.value
          : undefined;
    const name = calledName(expression);
    if (name && INPUT.has(name)) return { kind: 'entrada' };
    if (name && OUTPUT.has(name) && statement.kind === 'ExpressionStatement') return { kind: 'salida' };
    if (name && this.procedures.has(name)) {
      return this.options.expandProcedures ? { kind: 'llamada', procedure: name } : { kind: 'llamada' };
    }
    if (statement.kind === 'ExpressionStatement' && name) return { kind: 'llamada' };
    return { kind: 'proceso' };
  }

  statements(list: ast.Statement[], incoming: Pending[]): Pending[] {
    let current = incoming;
    for (const statement of list) current = this.statement(statement, current);
    return current;
  }

  private loop(body: () => Pending[]): { out: Pending[]; loop: Loop } {
    const loop: Loop = { breaks: [], continues: [] };
    this.loops.push(loop);
    const out = body();
    this.loops.pop();
    return { out, loop };
  }

  private back(pending: Pending[], kind: FlowEdgeKind = 'vuelta'): Pending[] {
    return pending.map(edge => (edge.kind && edge.kind !== 'normal' ? edge : { ...edge, kind }));
  }

  private statement(statement: ast.Statement, incoming: Pending[]): Pending[] {
    switch (statement.kind) {
      case 'FunctionDeclaration':
        // Se crea al entrar al bloque, no en este punto; su grafo va en `procedures`.
        return incoming;
      case 'Domain': {
        // Un dominio solo declara: es un paso de proceso que representa todas sus declaraciones.
        const members: ast.Statement[] = [];
        const collect = (domain: ast.Domain) => {
          members.push(domain);
          for (const member of domain.body.statements) {
            if (member.kind === 'VariableDeclaration') members.push(member);
            else if (member.kind === 'Domain') collect(member);
          }
        };
        collect(statement);
        const id = this.node('proceso', printStatement(statement), members);
        this.connect(incoming, id);
        return [{ from: id }];
      }
      case 'VariableDeclaration':
      case 'Assignment':
      case 'Increment':
      case 'ExpressionStatement': {
        const { kind, procedure } = this.kindOf(statement);
        return this.simple(kind, statement, incoming, procedure);
      }
      case 'Return': {
        const id = this.node('retorno', printStatement(statement), [statement]);
        this.connect(incoming, id);
        this.returns.push({ from: id, kind: 'regresa' });
        return [];
      }
      case 'Break':
      case 'Continue': {
        const id = this.node('proceso', printStatement(statement), [statement]);
        this.connect(incoming, id);
        const loop = this.loops[this.loops.length - 1];
        if (statement.kind === 'Break') loop?.breaks.push({ from: id, kind: 'romper' });
        else loop?.continues.push({ from: id, kind: 'continuar' });
        return [];
      }
      case 'Block':
        return this.statements(statement.statements, incoming);
      case 'If': {
        let pending = incoming;
        const out: Pending[] = [];
        statement.branches.forEach((branch, index) => {
          const astNodes = index === 0 ? [statement, branch.condition] : [branch.condition];
          const id = this.node('decisión', printExpression(branch.condition), astNodes);
          this.connect(pending, id);
          out.push(...this.statements(branch.body.statements, [{ from: id, label: 'sí' }]));
          pending = [{ from: id, label: 'no' }];
        });
        if (statement.alternative) out.push(...this.statements(statement.alternative.statements, pending));
        else out.push(...pending);
        return out;
      }
      case 'While': {
        const id = this.node('decisión', printExpression(statement.condition), [statement, statement.condition]);
        this.connect(incoming, id);
        const { out, loop } = this.loop(() => this.statements(statement.body.statements, [{ from: id, label: 'sí' }]));
        this.connect(this.back([...out, ...loop.continues]), id);
        return [{ from: id, label: 'no' }, ...loop.breaks];
      }
      case 'DoUntil': {
        // El cuerpo va primero; la entrada al bucle se conecta al primer nodo que cree.
        const first = this.nodes.length;
        const { out, loop } = this.loop(() => this.statements(statement.body.statements, incoming));
        const id = this.node('decisión', `hasta_que ${printExpression(statement.condition)}`, [
          statement,
          statement.condition,
        ]);
        this.connect([...out, ...loop.continues], id);
        const start = this.nodes[first]?.id ?? id;
        this.connect([{ from: id, label: 'no', kind: 'vuelta' }], start);
        if (start === id) this.edges.pop(); // cuerpo vacío: la vuelta sería un lazo sobre sí misma
        return [{ from: id, label: 'sí' }, ...loop.breaks];
      }
      case 'For': {
        let pending = incoming;
        const initOwner: ast.Statement[] = [];
        if (statement.init) {
          this.groupable = undefined;
          const before = this.nodes.length;
          pending = this.statement(statement.init, pending);
          // El paso del `para` se ilumina en su inicio.
          this.nodes[before]?.astIds.unshift(statement.id);
          this.nodes[before]?.spans.unshift(statement.span);
        } else {
          initOwner.push(statement);
        }
        const condition = statement.condition;
        const id = this.node('decisión', condition ? printExpression(condition) : 'verdadero', [
          ...initOwner,
          ...(condition ? [condition] : []),
        ]);
        this.connect(pending, id);
        const { out, loop } = this.loop(() => this.statements(statement.body.statements, [{ from: id, label: 'sí' }]));
        let tail = [...out, ...loop.continues];
        if (statement.update) tail = this.statement(statement.update, tail);
        this.connect(this.back(tail), id);
        return [...(condition ? [{ from: id, label: 'no' as const }] : []), ...loop.breaks];
      }
      case 'Repeat':
      case 'ForRange':
      case 'ForEach': {
        const head =
          statement.kind === 'Repeat'
            ? statement.count
            : statement.kind === 'ForRange'
              ? statement.to
              : statement.iterable;
        const id = this.node('decisión', printStatement(statement), [statement, head]);
        this.connect(incoming, id);
        const { out, loop } = this.loop(() =>
          this.statements(statement.body.statements, [{ from: id, label: 'repetir' }]),
        );
        this.connect(this.back([...out, ...loop.continues]), id);
        return [{ from: id, label: 'salir' }, ...loop.breaks];
      }
      default:
        return assertNever(statement, 'sentencia');
    }
  }

  finish(start: string, out: Pending[]): void {
    const end = this.node('fin', 'fin', []);
    this.connect([...out, ...this.returns], end);
    // Rango: distancia más larga desde el inicio sin contar vueltas (el grafo sin ellas no tiene ciclos).
    const forward = this.edges.filter(edge => edge.kind !== 'vuelta' && edge.kind !== 'continuar');
    const rank = new Map<string, number>([[start, 0]]);
    for (let changed = true, guard = 0; changed && guard <= this.nodes.length; guard++) {
      changed = false;
      for (const edge of forward) {
        const next = (rank.get(edge.from) ?? -1) + 1;
        if (rank.has(edge.from) && next > (rank.get(edge.to) ?? -1)) {
          rank.set(edge.to, next);
          changed = true;
        }
      }
    }
    for (const node of this.nodes) node.rank = rank.get(node.id) ?? 0;
  }
}

/** Procedimientos con nombre declarados en estas sentencias, con su ruta si están en un dominio. */
const procedureNames = (statements: ast.Statement[], known: Iterable<string> = []): Set<string> => {
  const names = new Set(known);
  const visit = (list: ast.Statement[], prefix: string) => {
    for (const statement of list) {
      if (statement.kind === 'FunctionDeclaration') names.add(`${prefix}${statement.name.name}`);
      if (statement.kind === 'Domain') visit(statement.body.statements, `${prefix}${statement.name.name}.`);
    }
  };
  visit(statements, '');
  return names;
};

/**
 * Grafo de flujo de un programa o de un procedimiento. Con errores de sintaxis el AST es parcial (el parser abandona
 * lo que no entendió) y el grafo muestra lo que sí se entendió.
 */
export const flowGraph = (
  root: ast.Program | ast.FunctionLiteral | ast.FunctionDeclaration,
  options: FlowOptions = {},
): FlowGraph => graphOf(root, options, []);

const graphOf = (
  root: ast.Program | ast.FunctionLiteral | ast.FunctionDeclaration,
  options: FlowOptions,
  known: Iterable<string>,
): FlowGraph => {
  const statements =
    root.kind === 'Program'
      ? root.statements
      : root.kind === 'FunctionDeclaration'
        ? root.function.body.statements
        : root.body.statements;
  const names = procedureNames(statements, known);
  const builder = new Builder(options, names, keysOf(statements));
  const title =
    root.kind === 'Program'
      ? 'inicio'
      : root.kind === 'FunctionDeclaration'
        ? printStatement(root)
        : `procedimiento(${root.params.map(param => param.name).join(', ')})`;
  const start = builder.node('inicio', title, root.kind === 'Program' ? [] : [root]);
  const out = builder.statements(statements, [{ from: start }]);
  builder.finish(start, out);

  const graph: FlowGraph = { nodes: builder.nodes, edges: builder.edges };
  if (options.expandProcedures) {
    graph.procedures = [];
    // Los procedimientos de un dominio se nombran con su ruta: `calculadora.suma`.
    const visit = (list: ast.Statement[], prefix: string) => {
      for (const statement of list) {
        if (statement.kind === 'Domain') visit(statement.body.statements, `${prefix}${statement.name.name}.`);
        if (statement.kind !== 'FunctionDeclaration') continue;
        graph.procedures!.push({
          name: `${prefix}${statement.name.name}`,
          astId: statement.id,
          graph: graphOf(statement, options, names),
        });
      }
    };
    visit(statements, '');
  }
  return graph;
};
