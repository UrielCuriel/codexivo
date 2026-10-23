import type * as ast from './syntax/ast';
import { repr } from './runtime/values';

/**
 * Convierte nodos del AST en texto corto de Codexivo (`suma += i`, `i <= 10`). Lo usan el diagrama de flujo y
 * cualquier vista que necesite mostrar una parte del programa sin copiar el código original.
 */

/** Precedencia de la §4.1 (mayor agrupa primero), para poner paréntesis solo donde hacen falta. */
const precedence = (node: ast.Expression): number => {
  switch (node.kind) {
    case 'Logical':
      return node.operator === 'o' ? 1 : 2;
    case 'Unary':
      return node.operator === 'no' ? 3 : 7;
    case 'Binary':
      switch (node.operator) {
        case '==':
        case '!=':
        case '<':
        case '>':
        case '<=':
        case '>=':
          return 4;
        case '+':
        case '-':
          return 5;
        case '^':
          return 8;
        default:
          return 6;
      }
    default:
      return 10;
  }
};

const operand = (node: ast.Expression, parent: number, wrapEqual: boolean): string => {
  const text = printExpression(node);
  const own = precedence(node);
  return own < parent || (wrapEqual && own === parent) ? `(${text})` : text;
};

export const printExpression = (node: ast.Expression): string => {
  switch (node.kind) {
    case 'NumberLiteral':
    case 'StringLiteral':
    case 'BooleanLiteral':
      return repr(node.value);
    case 'NullLiteral':
      return 'nulo';
    case 'Identifier':
      return node.name;
    case 'ListLiteral':
      return `[${node.elements.map(printExpression).join(', ')}]`;
    case 'DictLiteral':
      return node.entries.length === 0
        ? '{}'
        : `{ ${node.entries
            .map(entry => {
              const key = printExpression(entry.key);
              const literal = entry.key.kind === 'StringLiteral' || entry.key.kind === 'NumberLiteral';
              return `${literal ? key : `(${key})`}: ${printExpression(entry.value)}`;
            })
            .join(', ')} }`;
    case 'Unary': {
      const own = precedence(node);
      const inner = operand(node.operand, own, false);
      return node.operator === 'no' ? `no ${inner}` : `-${inner}`;
    }
    case 'Binary':
    case 'Logical': {
      const own = precedence(node);
      // `^` agrupa a la derecha; los demás, a la izquierda. Las comparaciones no se encadenan.
      const right = node.kind === 'Binary' && node.operator === '^';
      const compare = own === 4;
      const left = operand(node.left, own, right || compare);
      const rightText = operand(node.right, own, !right || compare);
      return `${left} ${node.operator} ${rightText}`;
    }
    case 'Call':
      return `${operand(node.callee, 10, false)}(${node.args.map(printExpression).join(', ')})`;
    case 'Index':
      if (node.dot && node.index.kind === 'StringLiteral')
        return `${operand(node.object, 10, false)}.${node.index.value}`;
      return `${operand(node.object, 10, false)}[${printExpression(node.index)}]`;
    case 'FunctionLiteral':
      return `procedimiento(${node.params.map(param => param.name).join(', ')}) { … }`;
  }
};

/**
 * Una sentencia en una línea. Las compuestas se resumen con su encabezado: `si (x > 0)`, `repetir 3 veces`,
 * `para_cada x en lista`.
 */
export const printStatement = (node: ast.Statement): string => {
  switch (node.kind) {
    case 'VariableDeclaration':
      return `${node.constant ? 'constante' : 'variable'} ${node.name.name} = ${printExpression(node.value)}`;
    case 'FunctionDeclaration':
      return `procedimiento ${node.name.name}(${node.function.params.map(param => param.name).join(', ')})`;
    case 'Assignment':
      return `${printExpression(node.target)} ${node.operator} ${printExpression(node.value)}`;
    case 'Increment':
      return `${printExpression(node.target)}${node.operator}`;
    case 'ExpressionStatement':
      return printExpression(node.expression);
    case 'Return':
      return node.value ? `regresa ${printExpression(node.value)}` : 'regresa';
    case 'Break':
      return 'romper';
    case 'Continue':
      return 'continuar';
    case 'Block':
      return '{ … }';
    case 'If':
      return `si (${printExpression(node.branches[0]!.condition)})`;
    case 'While':
      return `mientras (${printExpression(node.condition)})`;
    case 'DoUntil':
      return `hasta_que (${printExpression(node.condition)})`;
    case 'For':
      return `para (${node.condition ? printExpression(node.condition) : ''})`;
    case 'Repeat':
      return `repetir ${printExpression(node.count)} veces`;
    case 'ForEach':
      return `para_cada ${node.variable.name}${node.value ? `, ${node.value.name}` : ''} en ${printExpression(node.iterable)}`;
  }
};
