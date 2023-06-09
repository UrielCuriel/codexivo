import * as ast from './ast';
import { Number as NumberObj, Object, Boolean, Null, Return } from './object';

const TRUE = new Boolean(true);
const FALSE = new Boolean(false);
const NULL = new Null();

export const evaluate = (node: ast.ASTNode): Object => {
  if (node instanceof ast.Program) {
    assertValue(node.statements);
    return evaluateProgram(node);
  } else if (node instanceof ast.ExpressionStatement) {
    assertValue(node.expression);
    return evaluate(node.expression);
  } else if (node instanceof ast.Number) {
    assertValue(node.value);
    assertNumber(node.value);
    return new NumberObj(node.value);
  } else if (node instanceof ast.Boolean) {
    assertValue(node.value);
    return toBooleanObject(node.value);
  } else if (node instanceof ast.Prefix) {
    assertValue(node.right);
    const right = evaluate(node.right);
    assertValue(right);
    return evaluatePrefixExpression(node.operator, right);
  } else if (node instanceof ast.Infix) {
    assertValue(node.left);
    assertValue(node.right);
    const left = evaluate(node.left);
    const right = evaluate(node.right);
    assertValue(left);
    assertValue(right);
    return evaluateInfixExpression(node.operator, left, right);
  } else if (node instanceof ast.Block) {
    return evaluateBlockStatement(node);
  } else if (node instanceof ast.If) {
    return evaluateIfExpression(node);
  } else if (node instanceof ast.ReturnStatement) {
    assertValue(node.returnValue);
    const value = evaluate(node.returnValue);
    assertValue(value);
    return new Return(value);
  } else {
    return NULL;
  }
};

const assertValue = (value: unknown): void => {
  if (value === null || value === undefined) {
    throw new Error('value is null or undefined');
  }
};

const assertNumber = (value: unknown): void => {
  if (Number.isNaN(value)) {
    throw new Error('value is NaN');
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

const evaluateBooleanInfixExpression = (nodeOperator: string, left: Boolean, right: Boolean): Object => {
  switch (nodeOperator) {
    case '==':
      return toBooleanObject(left.value === right.value);
    case '!=':
      return toBooleanObject(left.value !== right.value);
    default:
      return NULL;
  }
};

const evaluateIfExpression = (node: ast.If): Object => {
  assertValue(node.condition);
  const condition = evaluate(node.condition);
  assertValue(condition);

  if (isTruthy(condition)) {
    assertValue(node.consequence);
    return evaluate(node.consequence);
  } else if (node.alternative) {
    assertValue(node.alternative);
    return evaluate(node.alternative);
  } else {
    return NULL;
  }
};

const isTruthy = (obj: Object): boolean => {
  switch (obj) {
    case NULL:
      return false;
    case TRUE:
      return true;
    case FALSE:
      return false;
    default:
      return true;
  }
};

const evaluateInfixExpression = (nodeOperator: string, left: Object, right: Object): Object => {
  if (left instanceof NumberObj && right instanceof NumberObj) {
    return evaluateNumberInfixExpression(nodeOperator, left, right);
  } else if (nodeOperator === '==') {
    return toBooleanObject(left === right);
  } else if (nodeOperator === '!=') {
    return toBooleanObject(left !== right);
  } else if (left instanceof Boolean && right instanceof Boolean) {
    return evaluateBooleanInfixExpression(nodeOperator, left, right);
  } else {
    return NULL;
  }
};

const evaluateNumberInfixExpression = (nodeOperator: string, left: NumberObj, right: NumberObj): Object => {
  switch (nodeOperator) {
    case '+':
      return new NumberObj(left.value + right.value);
    case '-':
      return new NumberObj(left.value - right.value);
    case '*':
      return new NumberObj(left.value * right.value);
    case '/':
      return new NumberObj(left.value / right.value);
    case '<':
      return toBooleanObject(left.value < right.value);
    case '>':
      return toBooleanObject(left.value > right.value);
    case '==':
      return toBooleanObject(left.value === right.value);
    case '!=':
      return toBooleanObject(left.value !== right.value);
    case '<=':
      return toBooleanObject(left.value <= right.value);
    case '>=':
      return toBooleanObject(left.value >= right.value);
    default:
      return NULL;
  }
};

const evaluateMinusPrefixOperatorExpression = (right: Object): Object => {
  if (!(right instanceof NumberObj)) {
    return NULL;
  }

  const value = right.value;
  return new NumberObj(-value);
};

const evaluateProgram = (program: ast.Program): Object => {
  let result: Object;

  for (const statement of program.statements) {
    result = evaluate(statement);
    if (result instanceof Return) {
      return result.value;
    }
  }

  return result;
};

const evaluateBlockStatement = (block: ast.Block): Object => {
  let result: Object;

  for (const statement of block.statements) {
    result = evaluate(statement);

    if (result instanceof Return || result instanceof Error) {
      return result;
    }
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
