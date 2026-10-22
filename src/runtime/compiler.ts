import type * as ast from '../syntax/ast';
import type { Value } from './values';

export type DecisionLabel = 'si' | 'pero_si' | 'mientras' | 'hasta_que' | 'para';

/**
 * Instrucciones de la máquina de Codexivo. Cada una conserva el nodo del AST que la originó, así la
 * máquina puede decir qué parte del código está ejecutando y dónde ocurrió un error.
 */
export type Instruction =
  /** Inicio de una sentencia: punto natural para pausar. */
  | { op: 'step'; node: ast.Statement }
  | { op: 'const'; value: Value; node: ast.Expression }
  | { op: 'list'; count: number; node: ast.ListLiteral }
  | { op: 'load'; name: string; node: ast.Identifier; forUpdate?: boolean }
  /** Saca un valor de la pila y crea la variable en el alcance actual. */
  | { op: 'declare'; name: string; node: ast.VariableDeclaration }
  /** Saca un valor de la pila y lo guarda en una variable existente. */
  | { op: 'store'; name: string; node: ast.Assignment }
  /** Saca un valor de la pila; es el valor de una sentencia de expresión. */
  | { op: 'result'; node: ast.ExpressionStatement }
  | { op: 'unary'; operator: ast.UnaryOperator; node: ast.Unary }
  | { op: 'binary'; operator: ast.BinaryOperator; node: ast.Binary | ast.Assignment }
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
  for (const statement of program.statements) compiler.statement(statement);
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
  for (const statement of node.body.statements) compiler.statement(statement);
  compiler.emit({ op: 'const', value: null, node });
  compiler.emit({ op: 'return', hasValue: true, node: { kind: 'Return', id: node.id, span: node.body.span } });
  return compiler.chunk;
};

class Compiler {
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

  statement(node: ast.Statement): void {
    if (node.kind !== 'Block') this.emit({ op: 'step', node });
    switch (node.kind) {
      case 'VariableDeclaration':
        this.expression(node.value);
        this.emit({ op: 'declare', name: node.name.name, node });
        return;
      case 'Assignment':
        if (node.operator !== '=') {
          this.emit({ op: 'load', name: node.target.name, node: node.target, forUpdate: true });
        }
        this.expression(node.value);
        if (node.operator !== '=') {
          this.emit({ op: 'binary', operator: node.operator[0] as ast.BinaryOperator, node });
        }
        this.emit({ op: 'store', name: node.target.name, node });
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
        this.block(node.body);
        this.emit({ op: 'jump', target: start });
        this.patch(exit, this.here);
        return;
      }
      case 'DoUntil': {
        const start = this.here;
        this.block(node.body);
        this.expression(node.condition);
        this.emit({
          op: 'branch',
          target: start,
          jumpWhen: false,
          label: 'hasta_que',
          node: node.condition,
          owner: node,
        });
        return;
      }
      case 'For': {
        this.emit({ op: 'enterScope' });
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
        this.block(node.body);
        if (node.update) this.statement(node.update);
        this.emit({ op: 'jump', target: start });
        if (exit >= 0) this.patch(exit, this.here);
        this.emit({ op: 'exitScope' });
        return;
      }
    }
  }

  private block(node: ast.Block): void {
    this.emit({ op: 'enterScope' });
    for (const statement of node.statements) this.statement(statement);
    this.emit({ op: 'exitScope' });
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
