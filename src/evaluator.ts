import * as ast from './ast';
import { Integer, Object } from './object';

export const evaluate = (node: ast.ASTNode): Object => {
  if (node instanceof ast.Program) {
    return evaluateStatements(node.statements);
  } else if (node instanceof ast.ExpressionStatement) {
    return evaluate(node.expression);
  } else if (node instanceof ast.Integer) {
    return new Integer(node.value);
  } else {
    return null;
  }
};

const evaluateStatements = (statements: ast.Statement[]): Object => {
  let result: Object;

  for (const statement of statements) {
    result = evaluate(statement);
  }

  return result;
};
