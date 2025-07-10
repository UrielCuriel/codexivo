import * as ast from './ast';
import {
  Number as NumberObj,
  Object,
  Boolean,
  Null,
  Return,
  Error as ObjectError,
  Environment,
  Function,
  String,
  Builtin,
} from './object';
import { reservedKeywords } from './token';
import { builtins } from './builtins';
import { newError } from './errors';

const TRUE = new Boolean(true);
const FALSE = new Boolean(false);
const NULL = new Null();

export const evaluate = (
  node: ast.ASTNode,
  env: Environment,
  line?: number,
  column?: number
): Object => {
  if (node instanceof ast.Program) {
    return evaluateProgramNode(node, env);
  }
  if (node instanceof ast.ExpressionStatement) {
    return evaluateExpressionStatementNode(node, env);
  }
  if (node instanceof ast.Number) {
    return evaluateNumberNode(node);
  }
  if (node instanceof ast.BooleanLiteral) {
    return evaluateBooleanLiteralNode(node);
  }
  if (node instanceof ast.Prefix) {
    return evaluatePrefixNode(node, env, line, column);
  }
  if (node instanceof ast.Infix) {
    return evaluateInfixNode(node, env, line, column);
  }
  if (node instanceof ast.Block) {
    return evaluateBlockStatement(node, env, node.line ?? 0, node.column ?? 0);
  }
  if (node instanceof ast.If) {
    return evaluateIfExpression(node, env);
  }
  if (node instanceof ast.ReturnStatement) {
    return evaluateReturnStatementNode(node, env);
  }
  if (node instanceof ast.LetStatement) {
    return evaluateLetStatementNode(node, env);
  }
  if (node instanceof ast.Identifier) {
    return evaluateIdentifier(node, env, node.line ?? 0, node.column ?? 0);
  }
  if (node instanceof ast.Function) {
    return evaluateFunctionNode(node, env);
  }
  if (node instanceof ast.Call) {
    return evaluateCallNode(node, env);
  }
  if (node instanceof ast.StringLiteral) {
    return evaluateStringLiteralNode(node);
  }
  return NULL;
};

function evaluateProgramNode(node: ast.Program, env: Environment): Object {
  assertValue(node.statements);
  return evaluateProgram(node, env);
}

function evaluateExpressionStatementNode(node: ast.ExpressionStatement, env: Environment): Object {
  assertValue(node.expression);
  if (!node.expression) throw new Error('Expression is required');
  return evaluate(node.expression, env, node.line, node.column);
}

function evaluateNumberNode(node: ast.Number): Object {
  assertValue(node.value);
  assertNumber(node.value);
  if (node.value === undefined) throw new Error('Number value is required');
  return new NumberObj(node.value);
}

function evaluateBooleanLiteralNode(node: ast.BooleanLiteral): Object {
  assertValue(node.value);
  if (node.value === undefined) throw new Error('Boolean value is required');
  return toBooleanObject(node.value);
}

function evaluatePrefixNode(node: ast.Prefix, env: Environment, line?: number, column?: number): Object {
  assertValue(node.right);
  assertValue(node.operator);
  if (!node.right || !node.operator) throw new Error('Prefix right and operator are required');
  const right = evaluate(node.right, env, node.line, node.column);
  assertValue(right);
  return evaluatePrefixExpression(node.operator, right, node.line ?? line, node.column ?? column);
}

function evaluateInfixNode(node: ast.Infix, env: Environment, line?: number, column?: number): Object {
  assertValue(node.left);
  assertValue(node.right);
  assertValue(node.operator);
  if (!node.left || !node.right || !node.operator) throw new Error('Infix left, right and operator are required');
  const left = evaluate(node.left, env, node.line, node.column);
  const right = evaluate(node.right, env, node.line, node.column);
  assertValue(left);
  assertValue(right);
  return evaluateInfixExpression(node.operator, left, right, node.line ?? line, node.column ?? column);
}

function evaluateReturnStatementNode(node: ast.ReturnStatement, env: Environment): Object {
  assertValue(node.returnValue);
  if (!node.returnValue) throw new Error('Return value is required');
  const value = evaluate(node.returnValue, env, node.line, node.column);
  assertValue(value);
  return new Return(value);
}

function evaluateLetStatementNode(node: ast.LetStatement, env: Environment): Object {
  assertValue(node.value);
  assertValue(node.name);
  if (!node.value || !node.name) throw new Error('Let statement value and name are required');
  const value = evaluate(node.value, env, node.line, node.column);
  env.set(node.name.value, value);
  return NULL;
}

function evaluateFunctionNode(node: ast.Function, env: Environment): Object {
  assertValue(node.parameters);
  assertValue(node.body);
  if (!node.parameters || !node.body) throw new Error('Function parameters and body are required');
  return new Function(node.parameters, node.body, env);
}

function evaluateCallNode(node: ast.Call, env: Environment): Object {
  const functionObj = evaluate(node.function_, env, node.line, node.column);
  assertValue(node.arguments_);
  if (!node.arguments_) throw new Error('Call arguments are required');
  const args = evaluateExpression(node.arguments_, env, node.line ?? 0, node.column ?? 0);
  assertValue(args);
  assertValue(functionObj);
  return applyFunction(functionObj, args, node.line ?? 0, node.column ?? 0);
}

function evaluateStringLiteralNode(node: ast.StringLiteral): Object {
  assertValue(node.value);
  return new String(node.value);
}

const applyFunction = (fn: Object, args: Object[], line: number, column: number): Object => {
  if (fn instanceof Function) {
    const extendedEnv = extendFunctionEnv(fn, args);
    const evaluated = evaluate(fn.body, extendedEnv);
    assertValue(evaluated);
    return unwrapReturnValue(evaluated);
  } else if (fn instanceof Builtin) {
    const result = fn.fn(...args);
    if (result instanceof ObjectError) {
      return newError('GENERIC_ERROR', { message: result.message, line, column });
    }
    return result;
  } else {
    return newError('NOT_A_FUNCTION', { line, column, name: fn.type() });
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

const evaluateExpression = (
  expressions: ast.Expression[],
  env: Environment,
  line: number,
  column: number,
): Object[] => {
  const result: Object[] = [];
  for (const expression of expressions) {
    const evaluated = evaluate(expression, env, line, column);
    assertValue(evaluated);
    result.push(evaluated);
  }
  return result;
};

const evaluateIdentifier = (node: ast.Identifier, env: Environment, line: number, column: number): Object => {
  if (isReservedWord(node.tokenLiteral())) {
    return newError('RESERVED_WORD', { name: node.value, line, column });
  }
  const value = env.get(node.value);
  if (!value) {
    if (builtins[node.value]) {
      return builtins[node.value];
    }
    return newError('UNKNOWN_IDENTIFIER', { name: node.value, line, column });
  }

  return value;
};

const isReservedWord = (word: string): boolean => {
  return reservedKeywords.includes(word);
};

const evaluateBooleanInfixExpression = (
  nodeOperator: string,
  left: Boolean,
  right: Boolean,
  line: number,
  column: number,
): Object => {
  if (nodeOperator === '==') return toBooleanObject(left.value === right.value);
  if (nodeOperator === '!=') return toBooleanObject(left.value !== right.value);
  return newError('UNKNOWN_INFIX_OPERATOR', {
    operator: nodeOperator,
    left: left.type(),
    right: right.type(),
    line,
    column,
  });
};

const evaluateIfExpression = (node: ast.If, env: Environment): Object => {
  assertValue(node.condition);
  if (!node.condition) throw new Error('If condition is required');
  const condition = evaluate(node.condition, env, node.line, node.column);
  assertValue(condition);

  if (isTruthy(condition)) {
    assertValue(node.consequence);
    if (!node.consequence) throw new Error('If consequence is required');
    return evaluate(node.consequence, env, node.line, node.column);
  } else if (node.alternative) {
    assertValue(node.alternative);
    return evaluate(node.alternative, env, node.line, node.column);
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

const evaluateInfixExpression = (
  nodeOperator: string,
  left: Object,
  right: Object,
  line: number,
  column: number,
): Object => {
  if (left instanceof NumberObj && right instanceof NumberObj) {
    return evaluateNumberInfixExpression(nodeOperator, left, right, line, column);
  } else if (left instanceof String && right instanceof String) {
    return evaluateStringInfixExpression(nodeOperator, left, right, line, column);
  } else if (nodeOperator === '==') {
    return toBooleanObject(left === right);
  } else if (nodeOperator === '!=') {
    return toBooleanObject(left !== right);
  } else if (left instanceof Boolean && right instanceof Boolean) {
    return evaluateBooleanInfixExpression(nodeOperator, left, right, line, column);
  } else if (left.type() !== right.type()) {
    return newError('TYPE_MISMATCH', {
      operator: nodeOperator,
      left: left.type(),
      right: right.type(),
      line,
      column,
    });
  } else {
    return newError('UNKNOWN_OPERATOR', {
      operator: nodeOperator,
      left: left.type(),
      right: right.type(),
      line,
      column,
    });
  }
};

const evaluateNumberInfixExpression = (
  nodeOperator: string,
  left: NumberObj,
  right: NumberObj,
  line: number,
  column: number,
): Object => {
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
      return newError('UNKNOWN_INFIX_OPERATOR', {
        type1: left.type(),
        operator: nodeOperator,
        type2: right.type(),
        line,
        column,
      });
  }
};

const evaluateStringInfixExpression = (
  nodeOperator: string,
  left: String,
  right: String,
  line: number,
  column: number,
): Object => {
  const leftValue = left.value;
  const rightValue = right.value;

  switch (nodeOperator) {
    case '+':
      return new String(leftValue + rightValue);
    case '==':
      return toBooleanObject(leftValue === rightValue);
    case '!=':
      return toBooleanObject(leftValue !== rightValue);
    default:
      return newError('UNKNOWN_INFIX_OPERATOR', {
        left: left.type(),
        operator: nodeOperator,
        right: right.type(),
        line,
        column,
      });
  }
};

const evaluateMinusPrefixOperatorExpression = (right: Object, line: number, column: number): Object => {
  if (!(right instanceof NumberObj)) {
    return newError('UNKNOWN_PREFIX_OPERATOR', { operator: '-', right: right.type(), line, column });
  }

  const value = right.value;
  return new NumberObj(-value);
};

const evaluateProgram = (program: ast.Program, env: Environment, line?: number, column?: number): Object => {
  let result: Object = NULL;

  for (const statement of program.statements) {
    result = evaluate(statement, env, line, column);
    if (result instanceof Return) {
      return result.value;
    } else if (result instanceof ObjectError) {
      return result;
    }
  }

  return result;
};

const evaluateBlockStatement = (block: ast.Block, env: Environment, line: number, column: number): Object => {
  let result: Object = NULL;

  for (const statement of block.statements) {
    result = evaluate(statement, env, line, column);

    if (result instanceof Return || result instanceof ObjectError) {
      return result;
    }
  }

  return result;
};

const evaluatePrefixExpression = (operator: string, right: Object, line: number, column: number): Object => {
  switch (operator) {
    case '!':
      return evaluateBangOperatorExpression(right);
    case '-':
      return evaluateMinusPrefixOperatorExpression(right, line, column);
    default:
      return newError('UNKNOWN_PREFIX_OPERATOR', { operator, right: right.type(), line, column });
  }
};

const toBooleanObject = (value: boolean): Boolean => {
  if (isTrue(value)) {
    return TRUE;
  }
  if (isFalse(value)) {
    return FALSE;
  }
  return FALSE;
};

const isTrue = (value: boolean): boolean => {
  return value === true;
};

const isFalse = (value: boolean): boolean => {
  return value === false;
};

const extendFunctionEnv = (fn: Function, args: Object[]): Environment => {
  const env = new Environment(fn.env);

  for (let i = 0; i < fn.parameters.length; i++) {
    env.set(fn.parameters[i].value, args[i]);
  }
  return env;
};

const unwrapReturnValue = (obj: Object): Object => {
  if (obj instanceof Return) {
    return obj.value;
  }

  return obj;
};
