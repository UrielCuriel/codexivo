import * as ast from './ast';
import {
  Array as ArrayObj,
  Boolean as BooleanObj,
  Builtin,
  Dictionary as DictionaryObj,
  Environment,
  Error as ErrorObj,
  Function as RuntimeFunction,
  Null,
  Number as NumberObj,
  Object as RuntimeObject,
  Return,
  String as StringObj,
} from './object';
import { reservedKeywords } from './token';
import { builtins } from './builtins';
import { newError } from './errors';
import { RuntimeTracer, RuntimeTracerOptions } from './runtime/tracer';

const TRUE = new BooleanObj(true);
const FALSE = new BooleanObj(false);
const NULL = new Null();

export interface EvaluationOptions extends RuntimeTracerOptions {
  tracer?: RuntimeTracer;
}

interface EvaluationState {
  tracer?: RuntimeTracer;
}

export interface Evaluator {
  evaluate(node: ast.ASTNode, env: Environment, line?: number, column?: number): RuntimeObject;
  tracer?: RuntimeTracer;
}

export const createEvaluator = (options: EvaluationOptions = {}): Evaluator => {
  const tracer = options.tracer ?? (shouldInstantiateTracer(options) ? new RuntimeTracer(options) : undefined);
  const state: EvaluationState = { tracer };

  const record = (node: ast.ASTNode, env: Environment, result: RuntimeObject | undefined, operation: string) => {
    state.tracer?.record({ node, env, result, operation });
  };

  const evaluateCompoundAssignment = (operator: string, node: ast.Infix, left: RuntimeObject, right: RuntimeObject, env: Environment, line: number, column: number): RuntimeObject => {
    if (!(node.left instanceof ast.Identifier)) {
      return newError('INVALID_ASSIGNMENT_TARGET', { operator: node.operator, target: node.left?.tokenLiteral() ?? 'expresión', line, column });
    }
    const opResult = evaluateInfixExpression(operator, left, right, line, column);
    if (isError(opResult)) {
      return opResult;
    }
    env.set(node.left.value, opResult);
    return opResult;
  };

  const evaluateNode = (
    node: ast.ASTNode,
    env: Environment,
    line: number = node.line ?? 0,
    column: number = node.column ?? 0,
  ): RuntimeObject => {
    if (node instanceof ast.Program) {
      state.tracer?.enterFrame({ name: 'programa', type: 'program', location: { line: node.line, column: node.column } });
      let result: RuntimeObject = NULL;
      for (const statement of node.statements) {
        result = evaluateNode(statement, env, statement.line, statement.column);
        if (result instanceof Return) {
          const value = result.value;
          record(node, env, value, 'program:return');
          state.tracer?.exitFrame();
          return value;
        }
        if (result instanceof ErrorObj) {
          record(node, env, result, 'program:error');
          state.tracer?.exitFrame();
          return result;
        }
      }
      record(node, env, result, 'program:evaluate');
      state.tracer?.exitFrame();
      return result;
    }

    if (node instanceof ast.ExpressionStatement) {
      if (!node.expression) {
        record(node, env, NULL, 'expression:empty');
        return NULL;
      }
      const result = evaluateNode(node.expression, env, node.line, node.column);
      record(node, env, result, 'expression:evaluate');
      return result;
    }

    if (node instanceof ast.Number) {
      assertValue(node.value);
      assertNumber(node.value);
      const result = new NumberObj(node.value);
      record(node, env, result, 'literal:number');
      return result;
    }

    if (node instanceof ast.Boolean) {
      assertValue(node.value);
      const result = toBooleanObject(node.value);
      record(node, env, result, 'literal:boolean');
      return result;
    }

    if (node instanceof ast.StringLiteral) {
      assertValue(node.value);
      const result = new StringObj(node.value);
      record(node, env, result, 'literal:string');
      return result;
    }

    if (node instanceof ast.ArrayLiteral) {
      const result = evaluateArrayLiteral(node, env, node.line ?? line, node.column ?? column);
      record(node, env, result, 'literal:array');
      return result;
    }

    if (node instanceof ast.HashLiteral) {
      const result = evaluateHashLiteral(node, env, node.line ?? line, node.column ?? column);
      record(node, env, result, 'literal:hash');
      return result;
    }

    if (node instanceof ast.Prefix) {
      assertValue(node.operator);
      assertValue(node.right);
      const right = evaluateNode(node.right, env, node.line, node.column);
      const result = evaluatePrefixExpression(node.operator, right, node.line ?? line, node.column ?? column);
      record(node, env, result, 'expression:prefix');
      return result;
    }

    if (node instanceof ast.Infix) {
      assertValue(node.left);
      assertValue(node.right);
      const left = evaluateNode(node.left, env, node.line, node.column);
      if (isError(left)) {
        record(node, env, left, 'expression:infix');
        return left;
      }
      const right = evaluateNode(node.right, env, node.line, node.column);
      if (isError(right)) {
        record(node, env, right, 'expression:infix');
        return right;
      }
      let result: RuntimeObject;
      if (node.operator === '+=') {
        result = evaluateCompoundAssignment('+', node, left, right, env, node.line ?? line, node.column ?? column);
      } else if (node.operator === '-=') {
        result = evaluateCompoundAssignment('-', node, left, right, env, node.line ?? line, node.column ?? column);
      } else if (node.operator === '*=') {
        result = evaluateCompoundAssignment('*', node, left, right, env, node.line ?? line, node.column ?? column);
      } else if (node.operator === '/=') {
        result = evaluateCompoundAssignment('/', node, left, right, env, node.line ?? line, node.column ?? column);
      } else {
        result = evaluateInfixExpression(node.operator, left, right, node.line ?? line, node.column ?? column);
      }
      record(node, env, result, 'expression:infix');
      return result;
    }

    if (node instanceof ast.Block) {
      const result = evaluateBlockStatement(node, env, node.line ?? line, node.column ?? column);
      record(node, env, result, 'block:evaluate');
      return result;
    }

    if (node instanceof ast.If) {
      const result = evaluateIfExpression(node, env);
      record(node, env, result, 'expression:if');
      return result;
    }

    if (node instanceof ast.While) {
      const result = evaluateWhileExpression(node, env, node.line ?? line, node.column ?? column);
      record(node, env, result, 'loop:while');
      return result;
    }

    if (node instanceof ast.DoWhile) {
      const result = evaluateDoWhileExpression(node, env, node.line ?? line, node.column ?? column);
      record(node, env, result, 'loop:dowhile');
      return result;
    }

    if (node instanceof ast.For) {
      const result = evaluateForExpression(node, env, node.line ?? line, node.column ?? column);
      record(node, env, result, 'loop:for');
      return result;
    }

    if (node instanceof ast.ReturnStatement) {
      assertValue(node.returnValue);
      const value = evaluateNode(node.returnValue, env, node.line, node.column);
      const result = new Return(value);
      record(node, env, value, 'statement:return');
      return result;
    }

    if (node instanceof ast.LetStatement) {
      assertValue(node.value);
      assertValue(node.name);
      const value = evaluateNode(node.value, env, node.line, node.column);
      env.set(node.name.value, value);
      record(node, env, value, 'statement:let');
      return value;
    }

    if (node instanceof ast.AssignmentStatement) {
      assertValue(node.value);
      assertValue(node.name);
      assertValue(node.operator);
      
      const currentValue = env.get(node.name.value);
      if (!currentValue) {
        const error = newError('UNDEFINED_IDENTIFIER', { name: node.name.value, line: node.line, column: node.column });
        record(node, env, error, 'statement:assignment');
        return error;
      }
      
      const rightValue = evaluateNode(node.value, env, node.line, node.column);
      if (isError(rightValue)) {
        record(node, env, rightValue, 'statement:assignment');
        return rightValue;
      }
      
      let newValue: RuntimeObject;
      
      switch (node.operator) {
        case '=':
          newValue = rightValue;
          break;
        case '+=':
          newValue = evaluateInfixExpression('+', currentValue, rightValue, node.line ?? 0, node.column ?? 0);
          break;
        case '-=':
          newValue = evaluateInfixExpression('-', currentValue, rightValue, node.line ?? 0, node.column ?? 0);
          break;
        case '*=':
          newValue = evaluateInfixExpression('*', currentValue, rightValue, node.line ?? 0, node.column ?? 0);
          break;
        case '/=':
          newValue = evaluateInfixExpression('/', currentValue, rightValue, node.line ?? 0, node.column ?? 0);
          break;
        default:
          const error = newError('UNKNOWN_OPERATOR', { operator: node.operator, left: 'ASSIGNMENT', right: '', line: node.line, column: node.column });
          record(node, env, error, 'statement:assignment');
          return error;
      }
      
      if (isError(newValue)) {
        record(node, env, newValue, 'statement:assignment');
        return newValue;
      }
      
      env.set(node.name.value, newValue);
      record(node, env, newValue, 'statement:assignment');
      return newValue;
    }

    if (node instanceof ast.Identifier) {
      const result = evaluateIdentifier(node, env, node.line ?? line, node.column ?? column);
      record(node, env, result, 'expression:identifier');
      return result;
    }

    if (node instanceof ast.Function) {
      assertValue(node.parameters);
      assertValue(node.body);
      const result = new RuntimeFunction(node.parameters, node.body, env, node.name?.value);
      record(node, env, result, 'literal:function');
      return result;
    }

    if (node instanceof ast.Call) {
      const fn = evaluateNode(node.function_, env, node.line, node.column);
      if (isError(fn)) {
        record(node, env, fn, 'expression:call');
        return fn;
      }
      const args = evaluateExpressions(
        node.arguments_ ?? [],
        env,
        node.line ?? line ?? 0,
        node.column ?? column ?? 0
      );
      const errorArg = args.find(isError);
      if (errorArg) {
        record(node, env, errorArg, 'expression:call');
        return errorArg;
      }
      const result = applyFunction(fn, args, node);
      record(node, env, result, 'expression:call');
      return result;
    }

    if (node instanceof ast.Index) {
      const result = evaluateIndexExpression(node, env, node.line ?? line, node.column ?? column);
      record(node, env, result, 'expression:index');
      return result;
    }

    return NULL;
  };

  const evaluateBlockStatement = (block: ast.Block, env: Environment, line: number, column: number): RuntimeObject => {
    let result: RuntimeObject = NULL;

    for (const statement of block.statements) {
      result = evaluateNode(statement, env, line, column);
      if (result instanceof Return || result instanceof ErrorObj) {
        return result;
      }
    }

    return result;
  };

  const evaluateIfExpression = (node: ast.If, env: Environment): RuntimeObject => {
    assertValue(node.condition);
    const condition = evaluateNode(node.condition, env, node.line, node.column);

    if (isTruthy(condition)) {
      assertValue(node.consequence);
      return evaluateNode(node.consequence, env, node.line, node.column);
    }

    if (node.alternative) {
      return evaluateNode(node.alternative, env, node.line, node.column);
    }

    return NULL;
  };

  const evaluateWhileExpression = (node: ast.While, env: Environment, line: number, column: number): RuntimeObject => {
    assertValue(node.condition);
    assertValue(node.body);
    let result: RuntimeObject = NULL;

    while (true) {
      const condition = evaluateNode(node.condition, env, node.condition?.line ?? line, node.condition?.column ?? column);
      if (isError(condition)) {
        return condition;
      }

      if (!isTruthy(condition)) {
        break;
      }

      const bodyResult = evaluateNode(node.body, env, node.body?.line ?? line, node.body?.column ?? column);
      if (bodyResult instanceof Return || isError(bodyResult)) {
        return bodyResult;
      }

      result = bodyResult;
    }

    return result;
  };

  const evaluateDoWhileExpression = (node: ast.DoWhile, env: Environment, line: number, column: number): RuntimeObject => {
    assertValue(node.body);
    assertValue(node.condition);
    let result: RuntimeObject = NULL;

    while (true) {
      const bodyResult = evaluateNode(node.body, env, node.body?.line ?? line, node.body?.column ?? column);
      if (bodyResult instanceof Return || isError(bodyResult)) {
        return bodyResult;
      }
      result = bodyResult;

      const condition = evaluateNode(node.condition, env, node.condition?.line ?? line, node.condition?.column ?? column);
      if (isError(condition)) {
        return condition;
      }

      if (isTruthy(condition)) {
        break;
      }
    }

    return result;
  };

  const evaluateForExpression = (node: ast.For, env: Environment, line: number, column: number): RuntimeObject => {
    let result: RuntimeObject = NULL;

    if (node.initializer) {
      const initializerResult = evaluateNode(
        node.initializer,
        env,
        node.initializer.line ?? line,
        node.initializer.column ?? column,
      );
      if (initializerResult instanceof Return || isError(initializerResult)) {
        return initializerResult;
      }
    }

    while (true) {
      if (node.condition) {
        const condition = evaluateNode(node.condition, env, node.condition.line ?? line, node.condition.column ?? column);
        if (isError(condition)) {
          return condition;
        }
        if (!isTruthy(condition)) {
          break;
        }
      }

      if (node.body) {
        const bodyResult = evaluateNode(node.body, env, node.body.line ?? line, node.body.column ?? column);
        if (bodyResult instanceof Return || isError(bodyResult)) {
          return bodyResult;
        }
        result = bodyResult;
      }

      if (node.increment) {
        const incrementResult = evaluateNode(
          node.increment,
          env,
          node.increment.line ?? line,
          node.increment.column ?? column,
        );
        if (incrementResult instanceof Return || isError(incrementResult)) {
          return incrementResult;
        }
      }
    }

    return result;
  };

  const evaluateArrayLiteral = (
    node: ast.ArrayLiteral,
    env: Environment,
    line: number,
    column: number,
  ): RuntimeObject => {
    const elements: RuntimeObject[] = [];
    for (const element of node.elements ?? []) {
      const evaluated = evaluateNode(element, env, element.line ?? line, element.column ?? column);
      if (isError(evaluated)) {
        return evaluated;
      }
      elements.push(evaluated);
    }
    return new ArrayObj(elements);
  };

  const evaluateHashLiteral = (
    node: ast.HashLiteral,
    env: Environment,
    line: number,
    column: number,
  ): RuntimeObject => {
    const pairs = new Map<string, RuntimeObject>();
    
    for (const pair of node.pairs ?? []) {
      const key = evaluateNode(pair.key, env, pair.key.line ?? line, pair.key.column ?? column);
      if (isError(key)) {
        return key;
      }

      // Keys must be strings or numbers (converted to strings)
      let keyString: string;
      if (key instanceof StringObj) {
        keyString = key.value;
      } else if (key instanceof NumberObj) {
        keyString = key.value.toString();
      } else {
        return newError('HASH_KEY_ERROR', { type: key.type(), line, column });
      }

      const value = evaluateNode(pair.value, env, pair.value.line ?? line, pair.value.column ?? column);
      if (isError(value)) {
        return value;
      }

      pairs.set(keyString, value);
    }
    
    return new DictionaryObj(pairs);
  };

  const evaluateIndexExpression = (
    node: ast.Index,
    env: Environment,
    line: number,
    column: number,
  ): RuntimeObject => {
    const left = evaluateNode(node.left, env, node.left.line ?? line, node.left.column ?? column);
    if (isError(left)) {
      return left;
    }

    if (!node.index) {
      return newError('GENERIC_ERROR', { message: 'faltó el índice para acceder al elemento', line, column });
    }

    const index = evaluateNode(node.index, env, node.index.line ?? line, node.index.column ?? column);
    if (isError(index)) {
      return index;
    }

    // Handle dictionaries first
    if (left instanceof DictionaryObj) {
      let keyString: string;
      if (index instanceof StringObj) {
        keyString = index.value;
      } else if (index instanceof NumberObj) {
        keyString = index.value.toString();
      } else {
        return newError('HASH_KEY_ERROR', { type: index.type(), line, column });
      }
      
      const value = left.pairs.get(keyString);
      if (value === undefined) {
        return NULL; // Dictionary key not found returns null
      }
      return value;
    }

    // For arrays and strings, we need numeric indices
    if (!(index instanceof NumberObj)) {
      return newError('TYPE_MISMATCH', {
        operator: '[]',
        left: left.type(),
        right: index.type(),
        line,
        column,
      });
    }

    const position = index.value;

    if (!Number.isInteger(position)) {
      return newError('GENERIC_ERROR', {
        message: 'los índices deben ser números enteros',
        line,
        column,
      });
    }

    if (left instanceof ArrayObj) {
      if (position < 0 || position >= left.elements.length) {
        return newError('INDEX_OUT_OF_BOUNDS', { index: position, line, column });
      }
      return left.elements[position];
    }

    if (left instanceof StringObj) {
      if (position < 0 || position >= left.value.length) {
        return newError('INDEX_OUT_OF_BOUNDS', { index: position, line, column });
      }
      return new StringObj(left.value.charAt(position));
    }

    return newError('INDEX_OPERATOR_NOT_SUPPORTED', { type: left.type(), line, column });
  };

  const evaluateExpressions = (
    expressions: ast.Expression[],
    env: Environment,
    line: number,
    column: number,
  ): RuntimeObject[] => {
    const result: RuntimeObject[] = [];
    for (const expression of expressions) {
      const evaluated = evaluateNode(expression, env, line, column);
      result.push(evaluated);
      if (isError(evaluated)) {
        break;
      }
    }
    return result;
  };

  const applyFunction = (
    fn: RuntimeObject,
    args: RuntimeObject[],
    callExpression: ast.Call,
  ): RuntimeObject => {
    if (fn instanceof RuntimeFunction) {
      const frameName = callExpression.function_ instanceof ast.Identifier ? callExpression.function_.value : 'procedimiento';
      state.tracer?.enterFrame({
        name: frameName,
        type: 'function',
        location: { line: callExpression.line, column: callExpression.column },
      });
      const extendedEnv = extendFunctionEnv(fn, args);
      const evaluated = evaluateNode(fn.body, extendedEnv, callExpression.line, callExpression.column);
      state.tracer?.exitFrame();
      return unwrapReturnValue(evaluated);
    }

    if (fn instanceof Builtin) {
      const frameName = callExpression.function_ instanceof ast.Identifier ? callExpression.function_.value : 'builtin';
      state.tracer?.enterFrame({
        name: frameName,
        type: 'builtin',
        location: { line: callExpression.line, column: callExpression.column },
      });
      const result = fn.fn(...args);
      state.tracer?.exitFrame();
      if (result instanceof ErrorObj) {
        return newError('GENERIC_ERROR', {
          message: result.message,
          line: callExpression.line ?? 0,
          column: callExpression.column ?? 0,
        });
      }
      return result;
    }

    return newError('NOT_A_FUNCTION', {
      line: callExpression.line ?? 0,
      column: callExpression.column ?? 0,
      name: fn.type(),
    });
  };

  const evaluateIdentifier = (node: ast.Identifier, env: Environment, line: number, column: number): RuntimeObject => {
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

  return {
    evaluate: evaluateNode,
    tracer,
  };
};

export const evaluate = (
  node: ast.ASTNode,
  env: Environment,
  options: EvaluationOptions = {},
): RuntimeObject => {
  const evaluator = createEvaluator(options);
  return evaluator.evaluate(node, env, node.line, node.column);
};

const shouldInstantiateTracer = (options: EvaluationOptions): boolean => {
  return Boolean(options.stepMode) || Boolean(options.breakpoints && options.breakpoints.length > 0);
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

const evaluateBangOperatorExpression = (right: RuntimeObject): RuntimeObject => {
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

const evaluatePrefixExpression = (
  operator: string,
  right: RuntimeObject,
  line: number,
  column: number,
): RuntimeObject => {
  switch (operator) {
    case '!':
      return evaluateBangOperatorExpression(right);
    case 'no':
      return evaluateBangOperatorExpression(right);
    case '-':
      return evaluateMinusPrefixOperatorExpression(right, line, column);
    default:
      return newError('UNKNOWN_PREFIX_OPERATOR', { operator, right: right.type(), line, column });
  }
};

const evaluateMinusPrefixOperatorExpression = (right: RuntimeObject, line: number, column: number): RuntimeObject => {
  if (!(right instanceof NumberObj)) {
    return newError('UNKNOWN_PREFIX_OPERATOR', { operator: '-', right: right.type(), line, column });
  }
  const value = right.value;
  return new NumberObj(-value);
};

const evaluateInfixExpression = (
  operator: string,
  left: RuntimeObject,
  right: RuntimeObject,
  line: number,
  column: number,
): RuntimeObject => {
  if (left instanceof NumberObj && right instanceof NumberObj) {
    return evaluateNumberInfixExpression(operator, left, right, line, column);
  }
  if (left instanceof StringObj && right instanceof StringObj) {
    return evaluateStringInfixExpression(operator, left, right, line, column);
  }
  if (operator === '==') {
    return toBooleanObject(left === right);
  }
  if (operator === '!=') {
    return toBooleanObject(left !== right);
  }
  if (left instanceof BooleanObj && right instanceof BooleanObj) {
    return evaluateBooleanInfixExpression(operator, left, right, line, column);
  }
  if (left.type() !== right.type()) {
    return newError('TYPE_MISMATCH', { operator, left: left.type(), right: right.type(), line, column });
  }
  return newError('UNKNOWN_OPERATOR', { operator, left: left.type(), right: right.type(), line, column });
};

const evaluateNumberInfixExpression = (
  operator: string,
  left: NumberObj,
  right: NumberObj,
  line: number,
  column: number,
): RuntimeObject => {
  switch (operator) {
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
        operator,
        type2: right.type(),
        line,
        column,
      });
  }
};

const evaluateStringInfixExpression = (
  operator: string,
  left: StringObj,
  right: StringObj,
  line: number,
  column: number,
): RuntimeObject => {
  const leftValue = left.value;
  const rightValue = right.value;

  switch (operator) {
    case '+':
      return new StringObj(leftValue + rightValue);
    case '==':
      return toBooleanObject(leftValue === rightValue);
    case '!=':
      return toBooleanObject(leftValue !== rightValue);
    default:
      return newError('UNKNOWN_INFIX_OPERATOR', {
        left: left.type(),
        operator,
        right: right.type(),
        line,
        column,
      });
  }
};

const evaluateBooleanInfixExpression = (
  operator: string,
  left: BooleanObj,
  right: BooleanObj,
  line: number,
  column: number,
): RuntimeObject => {
  switch (operator) {
    case '==':
      return toBooleanObject(left.value === right.value);
    case '!=':
      return toBooleanObject(left.value !== right.value);
    case 'y':
      return toBooleanObject(left.value && right.value);
    case 'o':
      return toBooleanObject(left.value || right.value);
    default:
      return newError('UNKNOWN_INFIX_OPERATOR', {
        operator,
        left: left.type(),
        right: right.type(),
        line,
        column,
      });
  }
};

const toBooleanObject = (value: boolean): BooleanObj => {
  return value ? TRUE : FALSE;
};

const extendFunctionEnv = (fn: RuntimeFunction, args: RuntimeObject[]): Environment => {
  const extended = new Environment(fn.env);
  for (let index = 0; index < fn.parameters.length; index++) {
    const argValue = (index < args.length && args[index] !== undefined) ? args[index] : NULL;
    extended.set(fn.parameters[index].value, argValue);
  }
  return extended;
};

const unwrapReturnValue = (obj: RuntimeObject): RuntimeObject => {
  if (obj instanceof Return) {
    return obj.value;
  }
  return obj;
};

const isTruthy = (obj: RuntimeObject): boolean => {
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

const isError = (obj: RuntimeObject): obj is ErrorObj => {
  return obj instanceof ErrorObj;
};

const isReservedWord = (word: string): boolean => {
  return reservedKeywords.includes(word);
};
