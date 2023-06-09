import * as ast from './ast';
import { Number as NumberObj, Object, Boolean, Null, Return, Error, Environment } from './object';

const TRUE = new Boolean(true);
const FALSE = new Boolean(false);
const NULL = new Null();

function template(strings: TemplateStringsArray, ...keys: any[]) {
  return (values: { [key: string]: any }) => {
    const result = [strings[0]];
    keys.forEach((key, i) => {
      const value = values[key];
      result.push(value, strings[i + 1]);
    });
    return result.join('');
  };
}

const _TYPE_MISMATCH = template`tipo de operando desconocido: ${'type1'} ${'operator'} ${'type2'} en la linea ${'line'} columna ${'column'}`;
const _UNKNOWN_PREFIX_OPERATOR = template`operador desconocido: ${'operator'}${'type'} en la linea ${'line'} columna ${'column'}`;
const _UNKNOWN_INFIX_OPERATOR = template`operador desconocido: ${'type1'} ${'operator'} ${'type2'} en la linea ${'line'} columna ${'column'}`;

export const evaluate = (node: ast.ASTNode, env: Environment, line?: number, column?: number): Object => {
  if (node instanceof ast.Program) {
    assertValue(node.statements);
    return evaluateProgram(node, env);
  } else if (node instanceof ast.ExpressionStatement) {
    assertValue(node.expression);
    return evaluate(node.expression, env, node.line, node.column);
  } else if (node instanceof ast.Number) {
    assertValue(node.value);
    assertNumber(node.value);
    return new NumberObj(node.value);
  } else if (node instanceof ast.Boolean) {
    assertValue(node.value);
    return toBooleanObject(node.value);
  } else if (node instanceof ast.Prefix) {
    assertValue(node.right);
    const right = evaluate(node.right, env, node.line, node.column);
    assertValue(right);
    return evaluatePrefixExpression(node.operator, right, node.line ?? line, node.column ?? column);
  } else if (node instanceof ast.Infix) {
    assertValue(node.left);
    assertValue(node.right);
    const left = evaluate(node.left, env, node.line, node.column);
    const right = evaluate(node.right, env, node.line, node.column);
    assertValue(left);
    assertValue(right);
    return evaluateInfixExpression(node.operator, left, right, node.line ?? line, node.column ?? column);
  } else if (node instanceof ast.Block) {
    return evaluateBlockStatement(node, env, node.line, node.column);
  } else if (node instanceof ast.If) {
    return evaluateIfExpression(node, env, node.line, node.column);
  } else if (node instanceof ast.ReturnStatement) {
    assertValue(node.returnValue);
    const value = evaluate(node.returnValue, env, node.line, node.column);
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

const evaluateBooleanInfixExpression = (
  nodeOperator: string,
  left: Boolean,
  right: Boolean,
  line: number,
  column: number,
): Object => {
  switch (nodeOperator) {
    case '==':
      return toBooleanObject(left.value === right.value);
    case '!=':
      return toBooleanObject(left.value !== right.value);
    default:
      return new Error(
        _UNKNOWN_INFIX_OPERATOR({ type1: left.type(), operator: nodeOperator, type2: right.type(), line, column }),
      );
  }
};

const evaluateIfExpression = (node: ast.If, env: Environment, line: number, column: number): Object => {
  assertValue(node.condition);
  const condition = evaluate(node.condition, env, node.line, node.column);
  assertValue(condition);

  if (isTruthy(condition)) {
    assertValue(node.consequence);
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
  } else if (nodeOperator === '==') {
    return toBooleanObject(left === right);
  } else if (nodeOperator === '!=') {
    return toBooleanObject(left !== right);
  } else if (left instanceof Boolean && right instanceof Boolean) {
    return evaluateBooleanInfixExpression(nodeOperator, left, right, line, column);
  } else if (left.type() !== right.type()) {
    return new Error(_TYPE_MISMATCH({ type1: left.type(), operator: nodeOperator, type2: right.type(), line, column }));
  } else {
    return new Error(
      _UNKNOWN_INFIX_OPERATOR({ type1: left.type(), operator: nodeOperator, type2: right.type(), line, column }),
    );
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
      return new Error(
        _UNKNOWN_INFIX_OPERATOR({ type1: left.type(), operator: nodeOperator, type2: right.type(), line, column }),
      );
  }
};

const evaluateMinusPrefixOperatorExpression = (right: Object, line: number, column: number): Object => {
  if (!(right instanceof NumberObj)) {
    return new Error(_UNKNOWN_PREFIX_OPERATOR({ operator: '-', type: right.type(), line, column }));
  }

  const value = right.value;
  return new NumberObj(-value);
};

const evaluateProgram = (program: ast.Program, env: Environment, line?: number, column?: number): Object => {
  let result: Object;

  for (const statement of program.statements) {
    result = evaluate(statement, env, line, column);
    if (result instanceof Return) {
      return result.value;
    } else if (result instanceof Error) {
      return result;
    }
  }

  return result;
};

const evaluateBlockStatement = (block: ast.Block, env: Environment, line: number, column: number): Object => {
  let result: Object;

  for (const statement of block.statements) {
    result = evaluate(statement, env, line, column);

    if (result instanceof Return || result instanceof Error) {
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
      return newError(_UNKNOWN_PREFIX_OPERATOR({ operator, type: right.type.name, line, column }));
  }
};

const newError = (message: string): Error => {
  return new Error(message);
};

const toBooleanObject = (value: boolean): Boolean => {
  return value ? TRUE : FALSE;
};
