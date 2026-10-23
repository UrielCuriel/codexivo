import type { Span } from './token';

/**
 * El AST está hecho de objetos planos: se puede serializar, enviar a un Web Worker y dibujar sin
 * perder información. Cada nodo tiene un `id` único dentro de su programa y su rango en el código.
 */
interface BaseNode {
  id: number;
  span: Span;
}

/** `%` y `mod` son el mismo operador; en el AST siempre aparece como `mod`. */
export type BinaryOperator = '+' | '-' | '*' | '/' | 'div' | 'mod' | '^' | '==' | '!=' | '<' | '>' | '<=' | '>=';
export type LogicalOperator = 'y' | 'o';
export type UnaryOperator = '-' | 'no';
export type AssignmentOperator = '=' | '+=' | '-=' | '*=' | '/=' | '%=';
export type IncrementOperator = '++' | '--';

// ── expresiones ──────────────────────────────────────────────────────────────

export interface NumberLiteral extends BaseNode {
  kind: 'NumberLiteral';
  value: number;
}

export interface StringLiteral extends BaseNode {
  kind: 'StringLiteral';
  value: string;
}

export interface BooleanLiteral extends BaseNode {
  kind: 'BooleanLiteral';
  value: boolean;
}

export interface NullLiteral extends BaseNode {
  kind: 'NullLiteral';
}

export interface ListLiteral extends BaseNode {
  kind: 'ListLiteral';
  elements: Expression[];
}

export interface Identifier extends BaseNode {
  kind: 'Identifier';
  name: string;
}

export interface Unary extends BaseNode {
  kind: 'Unary';
  operator: UnaryOperator;
  operand: Expression;
}

export interface Binary extends BaseNode {
  kind: 'Binary';
  operator: BinaryOperator;
  left: Expression;
  right: Expression;
}

/** `y` / `o`: se evalúan en cortocircuito, por eso no son un `Binary`. */
export interface Logical extends BaseNode {
  kind: 'Logical';
  operator: LogicalOperator;
  left: Expression;
  right: Expression;
}

export interface Call extends BaseNode {
  kind: 'Call';
  callee: Expression;
  args: Expression[];
}

export interface Index extends BaseNode {
  kind: 'Index';
  object: Expression;
  index: Expression;
}

export interface FunctionLiteral extends BaseNode {
  kind: 'FunctionLiteral';
  /** Nombre con el que se declaró, si se conoce (`variable doble = procedimiento…` → `doble`). */
  name?: string;
  params: Identifier[];
  body: Block;
}

export type Expression =
  | NumberLiteral
  | StringLiteral
  | BooleanLiteral
  | NullLiteral
  | ListLiteral
  | Identifier
  | Unary
  | Binary
  | Logical
  | Call
  | Index
  | FunctionLiteral;

// ── sentencias ───────────────────────────────────────────────────────────────

export interface VariableDeclaration extends BaseNode {
  kind: 'VariableDeclaration';
  /** `true` si se declaró con `constante`: no se puede reasignar. */
  constant: boolean;
  name: Identifier;
  value: Expression;
}

export interface Assignment extends BaseNode {
  kind: 'Assignment';
  target: Identifier;
  operator: AssignmentOperator;
  value: Expression;
}

/** `i++` / `i--`: son sentencias, no expresiones. */
export interface Increment extends BaseNode {
  kind: 'Increment';
  target: Identifier;
  operator: IncrementOperator;
}

export interface ExpressionStatement extends BaseNode {
  kind: 'ExpressionStatement';
  expression: Expression;
}

export interface Return extends BaseNode {
  kind: 'Return';
  value?: Expression;
}

export interface Block extends BaseNode {
  kind: 'Block';
  statements: Statement[];
}

export interface IfBranch {
  /** Rango de la rama completa: desde `si` / `pero_si` hasta su `}`. */
  span: Span;
  condition: Expression;
  body: Block;
}

/** `si … pero_si … si_no`: las ramas se guardan en orden, no anidadas. */
export interface If extends BaseNode {
  kind: 'If';
  branches: IfBranch[];
  alternative?: Block;
}

export interface While extends BaseNode {
  kind: 'While';
  condition: Expression;
  body: Block;
}

/** `hacer { … } hasta_que (condición)`: repite el cuerpo hasta que la condición sea verdadera. */
export interface DoUntil extends BaseNode {
  kind: 'DoUntil';
  body: Block;
  condition: Expression;
}

export interface For extends BaseNode {
  kind: 'For';
  init?: VariableDeclaration | Assignment | Increment | ExpressionStatement;
  condition?: Expression;
  update?: Assignment | Increment | ExpressionStatement;
  body: Block;
}

/** `repetir n veces { … }`: el contador es interno, no una variable visible. */
export interface Repeat extends BaseNode {
  kind: 'Repeat';
  count: Expression;
  body: Block;
}

export type Statement =
  | VariableDeclaration
  | Assignment
  | Increment
  | ExpressionStatement
  | Return
  | Block
  | If
  | While
  | DoUntil
  | For
  | Repeat;

export interface Program extends BaseNode {
  kind: 'Program';
  statements: Statement[];
}

export type Node = Program | Statement | Expression;

/** Hijos directos de un nodo, en el orden en que aparecen en el código. */
export const childrenOf = (node: Node): Node[] => {
  switch (node.kind) {
    case 'Program':
    case 'Block':
      return node.statements;
    case 'ListLiteral':
      return node.elements;
    case 'Unary':
      return [node.operand];
    case 'Binary':
    case 'Logical':
      return [node.left, node.right];
    case 'Call':
      return [node.callee, ...node.args];
    case 'Index':
      return [node.object, node.index];
    case 'FunctionLiteral':
      return [...node.params, node.body];
    case 'VariableDeclaration':
      return [node.name, node.value];
    case 'Assignment':
      return [node.target, node.value];
    case 'Increment':
      return [node.target];
    case 'ExpressionStatement':
      return [node.expression];
    case 'Return':
      return node.value ? [node.value] : [];
    case 'If':
      return [
        ...node.branches.flatMap(branch => [branch.condition, branch.body]),
        ...(node.alternative ? [node.alternative] : []),
      ];
    case 'While':
      return [node.condition, node.body];
    case 'DoUntil':
      return [node.body, node.condition];
    case 'Repeat':
      return [node.count, node.body];
    case 'For':
      return [
        ...(node.init ? [node.init] : []),
        ...(node.condition ? [node.condition] : []),
        ...(node.update ? [node.update] : []),
        node.body,
      ];
    default:
      return [];
  }
};

/** Recorre el árbol en profundidad, del padre a los hijos. */
export const walk = (node: Node, visit: (node: Node, parent?: Node) => void, parent?: Node): void => {
  visit(node, parent);
  for (const child of childrenOf(node)) walk(child, visit, node);
};
