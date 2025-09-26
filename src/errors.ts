import { Error as ErrorObj } from './object';

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

const _TYPE_MISMATCH = template`tipo de operando desconocido: ${'left'} ${'operator'} ${'right'} en la linea ${'line'} columna ${'column'}`;
const _UNKNOWN_PREFIX_OPERATOR = template`operador desconocido: ${'operator'}${'right'} en la linea ${'line'} columna ${'column'}`;
const _UNKNOWN_INFIX_OPERATOR = template`operador desconocido: ${'left'} ${'operator'} ${'right'} en la linea ${'line'} columna ${'column'}`;
const _UNKNOWN_IDENTIFIER = template`identificador no encontrado: ${'name'} en la linea ${'line'} columna ${'column'}`;
const _NOT_A_FUNCTION = template`${'name'} no es una función en la linea ${'line'} columna ${'column'}`;
const _RESERVED_WORD = template`no puedes usar la palabra reservada como identificador: ${'name'} en la linea ${'line'} columna ${'column'}`;
const _WRONG_NUMBER_OF_ARGUMENTS = template`numero incorrecto de argumentos para '${'name'}' se recibieron ${'received'}, se esperaban ${'expected'}`;
const _WRONG_TYPE_OF_ARGUMENT = template`tipo de argumento incorrecto para '${'name'}' se recibió ${'received'}, se esperaba ${'expected'}`;
const _INDEX_OPERATOR_NOT_SUPPORTED = template`el operador de índice no está soportado para el tipo ${'type'} en la linea ${'line'} columna ${'column'}`;
const _INDEX_OUT_OF_BOUNDS = template`índice fuera de rango (${'index'}) en la linea ${'line'} columna ${'column'}`;
const _INVALID_ASSIGNMENT_TARGET = template`no se puede asignar usando ${'operator'} sobre ${'target'} en la linea ${'line'} columna ${'column'}`;
const _DIVISION_BY_ZERO = template`división por cero en la linea ${'line'} columna ${'column'}`;
const _EMPTY_ARRAY = template`no se puede aplicar '${'name'}' sobre un arreglo vacío`;
const _UNDEFINED_IDENTIFIER = template`la variable '${'name'}' no está definida en la linea ${'line'} columna ${'column'}`;
const _GENERIC_ERROR = template`${'message'} en la linea ${'line'} columna ${'column'}`;

const ERROR_MESSAGES = {
  TYPE_MISMATCH: _TYPE_MISMATCH,
  UNKNOWN_PREFIX_OPERATOR: _UNKNOWN_PREFIX_OPERATOR,
  UNKNOWN_INFIX_OPERATOR: _UNKNOWN_INFIX_OPERATOR,
  UNKNOWN_IDENTIFIER: _UNKNOWN_IDENTIFIER,
  NOT_A_FUNCTION: _NOT_A_FUNCTION,
  RESERVED_WORD: _RESERVED_WORD,
  WRONG_NUMBER_OF_ARGUMENTS: _WRONG_NUMBER_OF_ARGUMENTS,
  WRONG_TYPE_OF_ARGUMENT: _WRONG_TYPE_OF_ARGUMENT,
  GENERIC_ERROR: _GENERIC_ERROR,
  INDEX_OPERATOR_NOT_SUPPORTED: _INDEX_OPERATOR_NOT_SUPPORTED,
  INDEX_OUT_OF_BOUNDS: _INDEX_OUT_OF_BOUNDS,
  INVALID_ASSIGNMENT_TARGET: _INVALID_ASSIGNMENT_TARGET,
  DIVISION_BY_ZERO: _DIVISION_BY_ZERO,
  EMPTY_ARRAY: _EMPTY_ARRAY,
  UNDEFINED_IDENTIFIER: _UNDEFINED_IDENTIFIER,
};

export const newError = (errorType: string, values: { [key: string]: any }): ErrorObj => {
  const message = ERROR_MESSAGES[errorType](values);
  return new ErrorObj(message);
};
