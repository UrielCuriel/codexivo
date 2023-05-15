import * as ast from './ast';
import { Integer, Object, Boolean, Null } from './object';

const TRUE = new Boolean(true);
const FALSE = new Boolean(false);
const NULL = new Null();

export const evaluate = (node: ast.ASTNode): Object => {
  if (node instanceof ast.Program) {
    assertValue(node.statements);
    return evaluateStatements(node.statements);
  } else if (node instanceof ast.ExpressionStatement) {
    assertValue(node.expression);
    return evaluate(node.expression);
  } else if (node instanceof ast.Integer) {
    assertValue(node.value);
    return new Integer(node.value);
  } else if (node instanceof ast.Boolean) {
    assertValue(node.value);
    return toBooleanObject(node.value);
  } else if (node instanceof ast.Prefix) {
    assertValue(node.right);
    const right = evaluate(node.right);
    assertValue(right);
    return evaluatePrefixExpression(node.operator, right);
  } else {
    return NULL;
  }
};

const assertValue = (value: unknown): void => {
  if (value === null || value === undefined) {
    throw new Error('value is null or undefined');
  }
};

const evaluateBangOperatorExpression = (right: Object): Object => {
  switch (right) {
    case TRUE:
      return FALSE;
    case FALSE:
      return TRUE;
    case NULL:
      return TRUE;
    default:
      return FALSE;
  }
};

const evaluateMinusPrefixOperatorExpression = (right: Object): Object => {
  if (!(right instanceof Integer)) {
    return NULL;
  }

  const value = right.value;
  return new Integer(-value);
};

const evaluateStatements = (statements: ast.Statement[]): Object => {
  let result: Object;

  for (const statement of statements) {
    result = evaluate(statement);
  }

  return result;
};

const evaluatePrefixExpression = (operator: string, right: Object): Object => {
  switch (operator) {
    case '!':
      return evaluateBangOperatorExpression(right);
    case '-':
      return evaluateMinusPrefixOperatorExpression(right);
    default:
      return NULL;
  }
};

const toBooleanObject = (value: boolean): Boolean => {
  return value ? TRUE : FALSE;
};
