import * as ast from './ast';
import {
  Number as NumberObj,
  Object,
  Boolean,
  Null,
  Return,
  Error as ErrorObj,
  Environment,
  Function,
  String,
} from './object';
import { reservedKeywords } from './token';

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
const _UNKNOWN_IDENTIFIER = template`identificador no encontrado: ${'name'} en la linea ${'line'} columna ${'column'}`;
const _NOT_A_FUNCTION = template`${'name'} no es una función en la linea ${'line'} columna ${'column'}`;
const _RESERVED_WORD = template`no puedes usar la palabra reservada como identificador: ${'name'} en la linea ${'line'} columna ${'column'}`;

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
    return evaluateIfExpression(node, env);
  } else if (node instanceof ast.ReturnStatement) {
    assertValue(node.returnValue);
    const value = evaluate(node.returnValue, env, node.line, node.column);
    assertValue(value);
    return new Return(value);
  } else if (node instanceof ast.LetStatement) {
    assertValue(node.value);
    const value = evaluate(node.value, env, node.line, node.column);
    assertValue(node.name);
    env.set(node.name.value, value);
  } else if (node instanceof ast.Identifier) {
    return evaluateIdentifier(node, env, node.line, node.column);
  } else if (node instanceof ast.Function) {
    assertValue(node.parameters);
    assertValue(node.body);
    return new Function(node.parameters, node.body, env);
  } else if (node instanceof ast.Call) {
    const functionObj = evaluate(node.function_, env, node.line, node.column);
    const args = evaluateExpression(node.arguments_, env, node.line, node.column);
    assertValue(args);
    assertValue(functionObj);
    return applyFunction(functionObj, args, node.line, node.column);
  } else if (node instanceof ast.StringLiteral) {
    assertValue(node.value);
    return new String(node.value);
  } else {
    return NULL;
  }
};

const applyFunction = (fn: Object, args: Object[], line: number, column: number): Object => {
  if (!(fn instanceof Function)) {
    return newError(_NOT_A_FUNCTION({ name: fn.type(), line, column }));
  }
  const extendedEnv = extendFunctionEnv(fn, args);
  const evaluated = evaluate(fn.body, extendedEnv);
  assertValue(evaluated);
  return unwrapReturnValue(evaluated);
};
const assertValue = (value: unknown): void => {
  if (value === null || value === undefined) {
    const err = new Error('value is null or undefined');
    console.error(err.stack);
    throw err;
  }
};

const assertNumber = (value: unknown): void => {
  if (Number.isNaN(value)) {
    const err = new Error('value is NaN');
    console.error(err.stack);
    throw err;
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
    return newError(_RESERVED_WORD({ name: node.value, line, column }));
  }
  const value = env.get(node.value);
  if (!value) {
    return newError(_UNKNOWN_IDENTIFIER({ name: node.value, line, column }));
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
  switch (nodeOperator) {
    case '==':
      return toBooleanObject(left.value === right.value);
    case '!=':
      return toBooleanObject(left.value !== right.value);
    default:
      return newError(
        _UNKNOWN_INFIX_OPERATOR({ type1: left.type(), operator: nodeOperator, type2: right.type(), line, column }),
      );
  }
};

const evaluateIfExpression = (node: ast.If, env: Environment): Object => {
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
  } else if (left instanceof String && right instanceof String) {
    return evaluateStringInfixExpression(nodeOperator, left, right, line, column);
  } else if (nodeOperator === '==') {
    return toBooleanObject(left === right);
  } else if (nodeOperator === '!=') {
    return toBooleanObject(left !== right);
  } else if (left instanceof Boolean && right instanceof Boolean) {
    return evaluateBooleanInfixExpression(nodeOperator, left, right, line, column);
  } else if (left.type() !== right.type()) {
    return newError(_TYPE_MISMATCH({ type1: left.type(), operator: nodeOperator, type2: right.type(), line, column }));
  } else {
    return newError(
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
      return newError(
        _UNKNOWN_INFIX_OPERATOR({ type1: left.type(), operator: nodeOperator, type2: right.type(), line, column }),
      );
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
      return newError(
        _UNKNOWN_INFIX_OPERATOR({ type1: left.type(), operator: nodeOperator, type2: right.type(), line, column }),
      );
  }
};

const evaluateMinusPrefixOperatorExpression = (right: Object, line: number, column: number): Object => {
  if (!(right instanceof NumberObj)) {
    return newError(_UNKNOWN_PREFIX_OPERATOR({ operator: '-', type: right.type(), line, column }));
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

const newError = (message: string): ErrorObj => {
  return new ErrorObj(message);
};

const toBooleanObject = (value: boolean): Boolean => {
  return value ? TRUE : FALSE;
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
