import type * as ast from '../syntax/ast';
import type { Value } from './values';

export type DecisionLabel = 'si' | 'pero_si' | 'mientras' | 'hasta_que' | 'para' | 'repetir' | 'para_cada';

/**
 * Instrucciones de la máquina de Codexivo. Cada una conserva el nodo del AST que la originó, así la
 * máquina puede decir qué parte del código está ejecutando y dónde ocurrió un error.
 */
export type Instruction =
  /** Inicio de una sentencia: punto natural para pausar. */
  | { op: 'step'; node: ast.Statement }
  | { op: 'const'; value: Value; node: ast.Node }
  | { op: 'list'; count: number; node: ast.ListLiteral }
  | { op: 'load'; name: string; node: ast.Identifier; forUpdate?: boolean }
  /**
   * Saca un valor de la pila y crea la variable (o constante) `target` en el alcance actual. `node` es la
   * sentencia que la declara: una declaración, un procedimiento con nombre o la variable de un `para_cada`.
   */
  | { op: 'declare'; name: string; constant: boolean; target: ast.Identifier; node: ast.Node }
  /** Saca un valor de la pila y lo guarda en una variable existente. */
  | { op: 'store'; name: string; target: ast.Identifier; node: ast.Assignment | ast.Increment }
  /** Saca valor, índice y lista (en ese orden) y cambia el elemento. */
  | { op: 'setIndex'; target: ast.Index; node: ast.Assignment | ast.Increment }
  /** Copia los `count` valores de la cima de la pila. */
  | { op: 'dup'; count: number }
  /** Saca `count` valores de la pila (los valores ocultos de un bucle al salir con `romper`). */
  | { op: 'pop'; count: number }
  /** Saca un valor de la pila; es el valor de una sentencia de expresión. */
  | { op: 'result'; node: ast.ExpressionStatement }
  | { op: 'unary'; operator: ast.UnaryOperator; node: ast.Unary }
  | { op: 'binary'; operator: ast.BinaryOperator; node: ast.Binary | ast.Assignment | ast.Increment }
  | { op: 'index'; node: ast.Index }
  | { op: 'closure'; chunk: Chunk; node: ast.FunctionLiteral }
  | { op: 'call'; argc: number; node: ast.Call }
  | { op: 'return'; hasValue: boolean; node: ast.Return }
  | { op: 'jump'; target: number }
  /** Saca la condición (debe ser lógica) y salta si vale `jumpWhen`. */
  | {
      op: 'branch';
      target: number;
      jumpWhen: boolean;
      label: DecisionLabel;
      node: ast.Expression;
      owner: ast.Statement;
    }
  /** Revisa que la cantidad de `repetir` (en la cima de la pila) sea un entero ≥ 0; queda como contador oculto. */
  | { op: 'repeatStart'; node: ast.Expression; owner: ast.Repeat }
  /** Si al contador le quedan vueltas, lo reduce y sigue; si no, lo saca de la pila y salta a `target`. */
  | { op: 'repeatNext'; target: number; node: ast.Expression; owner: ast.Repeat }
  /** Revisa que lo que se recorre sea una lista o un texto y agrega su longitud y la posición 0 a la pila. */
  | { op: 'forEachStart'; node: ast.Expression; owner: ast.ForEach }
  /** Si quedan elementos, pone el siguiente en la pila; si no, saca los valores ocultos y salta a `target`. */
  | { op: 'forEachNext'; target: number; node: ast.Expression; owner: ast.ForEach }
  /** Cortocircuito: revisa el lado izquierdo de `y`/`o`; si ya decide el resultado, lo deja y salta. */
  | { op: 'shortCircuit'; target: number; node: ast.Logical }
  /** Revisa que el lado derecho de `y`/`o` sea lógico. */
  | { op: 'checkLogical'; node: ast.Logical }
  | { op: 'enterScope' }
  | { op: 'exitScope' }
  | { op: 'halt' };

/** Código de un procedimiento o del programa principal. */
export interface Chunk {
  name: string;
  params: string[];
  code: Instruction[];
  node: ast.Program | ast.FunctionLiteral;
}

/** Traduce el AST a instrucciones. El AST debe venir sin errores de sintaxis. */
export const compile = (program: ast.Program): Chunk => {
  const compiler = new Compiler({ name: 'programa', params: [], code: [], node: program });
  compiler.statements(program.statements);
  compiler.emit({ op: 'halt' });
  return compiler.chunk;
};

const compileFunction = (node: ast.FunctionLiteral): Chunk => {
  const compiler = new Compiler({
    name: node.name ?? 'procedimiento',
    params: node.params.map(param => param.name),
    code: [],
    node,
  });
  // El cuerpo comparte alcance con los parámetros: así `variable x` dentro de `procedimiento(x)` es un error.
  compiler.statements(node.body.statements);
  compiler.emit({ op: 'const', value: null, node });
  compiler.emit({ op: 'return', hasValue: true, node: { kind: 'Return', id: node.id, span: node.body.span } });
  return compiler.chunk;
};

/** Operador que aplica cada asignación compuesta. */
const COMPOUND_OPERATORS: Record<Exclude<ast.AssignmentOperator, '='>, ast.BinaryOperator> = {
  '+=': '+',
  '-=': '-',
  '*=': '*',
  '/=': '/',
  '%=': 'mod',
};

/** Un bucle abierto: a dónde saltan `romper` y `continuar`, y qué hay que limpiar antes. */
interface Loop {
  breaks: number[];
  continues: number[];
  /** Alcances abiertos en el punto al que llegan los saltos. */
  scopeDepth: number;
  /** Valores ocultos del bucle en la pila (el contador de `repetir`, el estado de `para_cada`). */
  slots: number;
}

class Compiler {
  private scopeDepth = 0;
  private readonly loops: Loop[] = [];

  constructor(readonly chunk: Chunk) {}

  emit(instruction: Instruction): number {
    this.chunk.code.push(instruction);
    return this.chunk.code.length - 1;
  }

  private get here(): number {
    return this.chunk.code.length;
  }

  private patch(at: number, target: number): void {
    const instruction = this.chunk.code[at];
    if (instruction && 'target' in instruction) instruction.target = target;
  }

  private enterScope(): void {
    this.emit({ op: 'enterScope' });
    this.scopeDepth += 1;
  }

  private exitScope(): void {
    this.emit({ op: 'exitScope' });
    this.scopeDepth -= 1;
  }

  /** Las sentencias de un bloque. Los procedimientos con nombre se crean antes que todo lo demás. */
  statements(statements: ast.Statement[]): void {
    for (const statement of statements) {
      if (statement.kind !== 'FunctionDeclaration') continue;
      this.emit({ op: 'closure', chunk: compileFunction(statement.function), node: statement.function });
      this.emit({
        op: 'declare',
        name: statement.name.name,
        constant: false,
        target: statement.name,
        node: statement,
      });
    }
    for (const statement of statements) this.statement(statement);
  }

  /** Abre un bucle, compila su cuerpo y regresa los saltos de `romper` y `continuar` para conectarlos. */
  private loop(slots: number, body: () => void): Loop {
    const loop: Loop = { breaks: [], continues: [], scopeDepth: this.scopeDepth, slots };
    this.loops.push(loop);
    body();
    this.loops.pop();
    return loop;
  }

  private connect(jumps: number[], target: number): void {
    for (const jump of jumps) this.patch(jump, target);
  }

  statement(node: ast.Statement): void {
    if (node.kind === 'FunctionDeclaration') return; // ya se declaró al entrar al bloque
    if (node.kind !== 'Block') this.emit({ op: 'step', node });
    switch (node.kind) {
      case 'VariableDeclaration':
        this.expression(node.value);
        this.emit({ op: 'declare', name: node.name.name, constant: node.constant, target: node.name, node });
        return;
      case 'Assignment':
      case 'Increment':
        this.assignment(node);
        return;
      case 'ExpressionStatement':
        this.expression(node.expression);
        this.emit({ op: 'result', node });
        return;
      case 'Return':
        if (node.value) this.expression(node.value);
        this.emit({ op: 'return', hasValue: Boolean(node.value), node });
        return;
      case 'Block':
        this.block(node);
        return;
      case 'Break':
      case 'Continue': {
        const loop = this.loops[this.loops.length - 1]!;
        // El código que sigue nunca se ejecuta, así que la cuenta de alcances no cambia.
        for (let depth = this.scopeDepth; depth > loop.scopeDepth; depth--) this.emit({ op: 'exitScope' });
        if (node.kind === 'Break') {
          if (loop.slots > 0) this.emit({ op: 'pop', count: loop.slots });
          loop.breaks.push(this.emit({ op: 'jump', target: -1 }));
        } else {
          loop.continues.push(this.emit({ op: 'jump', target: -1 }));
        }
        return;
      }
      case 'If': {
        const exits: number[] = [];
        node.branches.forEach((branch, index) => {
          this.expression(branch.condition);
          const skip = this.emit({
            op: 'branch',
            target: -1,
            jumpWhen: false,
            label: index === 0 ? 'si' : 'pero_si',
            node: branch.condition,
            owner: node,
          });
          this.block(branch.body);
          exits.push(this.emit({ op: 'jump', target: -1 }));
          this.patch(skip, this.here);
        });
        if (node.alternative) this.block(node.alternative);
        for (const exit of exits) this.patch(exit, this.here);
        return;
      }
      case 'While': {
        const start = this.here;
        this.expression(node.condition);
        const exit = this.emit({
          op: 'branch',
          target: -1,
          jumpWhen: false,
          label: 'mientras',
          node: node.condition,
          owner: node,
        });
        const loop = this.loop(0, () => this.block(node.body));
        this.emit({ op: 'jump', target: start });
        this.patch(exit, this.here);
        this.connect(loop.continues, start);
        this.connect(loop.breaks, this.here);
        return;
      }
      case 'DoUntil': {
        const start = this.here;
        const loop = this.loop(0, () => this.block(node.body));
        this.connect(loop.continues, this.here);
        this.expression(node.condition);
        this.emit({
          op: 'branch',
          target: start,
          jumpWhen: false,
          label: 'hasta_que',
          node: node.condition,
          owner: node,
        });
        this.connect(loop.breaks, this.here);
        return;
      }
      case 'For': {
        this.enterScope();
        if (node.init) this.statement(node.init);
        const start = this.here;
        let exit = -1;
        if (node.condition) {
          this.expression(node.condition);
          exit = this.emit({
            op: 'branch',
            target: -1,
            jumpWhen: false,
            label: 'para',
            node: node.condition,
            owner: node,
          });
        }
        const loop = this.loop(0, () => this.block(node.body));
        this.connect(loop.continues, this.here);
        if (node.update) this.statement(node.update);
        this.emit({ op: 'jump', target: start });
        if (exit >= 0) this.patch(exit, this.here);
        this.connect(loop.breaks, this.here);
        this.exitScope();
        return;
      }
      case 'Repeat': {
        this.expression(node.count);
        this.emit({ op: 'repeatStart', node: node.count, owner: node });
        const start = this.here;
        const exit = this.emit({ op: 'repeatNext', target: -1, node: node.count, owner: node });
        const loop = this.loop(1, () => this.block(node.body));
        this.emit({ op: 'jump', target: start });
        this.patch(exit, this.here);
        this.connect(loop.continues, start);
        this.connect(loop.breaks, this.here);
        return;
      }
      case 'ForEach': {
        this.expression(node.iterable);
        this.emit({ op: 'forEachStart', node: node.iterable, owner: node });
        const start = this.here;
        const exit = this.emit({ op: 'forEachNext', target: -1, node: node.iterable, owner: node });
        const loop = this.loop(3, () => {
          // La variable del bucle es nueva en cada vuelta y comparte alcance con el cuerpo.
          this.enterScope();
          this.emit({
            op: 'declare',
            name: node.variable.name,
            constant: false,
            target: node.variable,
            node: node.variable,
          });
          this.statements(node.body.statements);
          this.exitScope();
        });
        this.emit({ op: 'jump', target: start });
        this.patch(exit, this.here);
        this.connect(loop.continues, start);
        this.connect(loop.breaks, this.here);
        return;
      }
    }
  }

  private assignment(node: ast.Assignment | ast.Increment): void {
    const operator =
      node.kind === 'Increment'
        ? node.operator === '++'
          ? '+'
          : '-'
        : node.operator === '='
          ? undefined
          : COMPOUND_OPERATORS[node.operator];
    const value = () => {
      if (node.kind === 'Increment') this.emit({ op: 'const', value: 1, node: node.target });
      else this.expression(node.value);
    };
    const { target } = node;

    if (target.kind === 'Identifier') {
      if (operator) this.emit({ op: 'load', name: target.name, node: target, forUpdate: true });
      value();
      if (operator) this.emit({ op: 'binary', operator, node });
      this.emit({ op: 'store', name: target.name, target, node });
      return;
    }

    this.expression(target.object);
    this.expression(target.index);
    if (operator) {
      this.emit({ op: 'dup', count: 2 });
      this.emit({ op: 'index', node: target });
    }
    value();
    if (operator) this.emit({ op: 'binary', operator, node });
    this.emit({ op: 'setIndex', target, node });
  }

  private block(node: ast.Block): void {
    this.enterScope();
    this.statements(node.statements);
    this.exitScope();
  }

  private expression(node: ast.Expression): void {
    switch (node.kind) {
      case 'NumberLiteral':
      case 'StringLiteral':
      case 'BooleanLiteral':
        this.emit({ op: 'const', value: node.value, node });
        return;
      case 'NullLiteral':
        this.emit({ op: 'const', value: null, node });
        return;
      case 'ListLiteral':
        for (const element of node.elements) this.expression(element);
        this.emit({ op: 'list', count: node.elements.length, node });
        return;
      case 'Identifier':
        this.emit({ op: 'load', name: node.name, node });
        return;
      case 'Unary':
        this.expression(node.operand);
        this.emit({ op: 'unary', operator: node.operator, node });
        return;
      case 'Binary':
        this.expression(node.left);
        this.expression(node.right);
        this.emit({ op: 'binary', operator: node.operator, node });
        return;
      case 'Logical': {
        this.expression(node.left);
        const skip = this.emit({ op: 'shortCircuit', target: -1, node });
        this.expression(node.right);
        this.emit({ op: 'checkLogical', node });
        this.patch(skip, this.here);
        return;
      }
      case 'Call':
        this.expression(node.callee);
        for (const arg of node.args) this.expression(arg);
        this.emit({ op: 'call', argc: node.args.length, node });
        return;
      case 'Index':
        this.expression(node.object);
        this.expression(node.index);
        this.emit({ op: 'index', node });
        return;
      case 'FunctionLiteral':
        this.emit({ op: 'closure', chunk: compileFunction(node), node });
        return;
    }
  }
}
