import { newError } from './errors';
import { Array as ArrayValue, Builtin, BuiltinFunction, Error, Number, Object, String } from './object';

const longitud: BuiltinFunction = (...args: Object[]): Object => {
  if (args.length !== 1) {
    return newError('WRONG_NUMBER_OF_ARGUMENTS', { expected: 1, received: args.length, name: 'longitud' });
  }
  const [value] = args;
  if (value.type() === 'STRING') {
    return new Number((value as String).value.length);
  }
  if (value.type() === 'ARRAY') {
    return new Number((value as ArrayValue).elements.length);
  }
  return newError('WRONG_TYPE_OF_ARGUMENT', {
    name: 'longitud',
    expected: 'STRING o ARREGLO',
    received: value.type(),
  });
};

const absoluto: BuiltinFunction = (...args: Object[]): Object => {
  if (args.length !== 1) {
    return newError('WRONG_NUMBER_OF_ARGUMENTS', { expected: 1, received: args.length, name: 'absoluto' });
  }
  const [value] = args;
  if (value.type() !== 'NUMBER') {
    return newError('WRONG_TYPE_OF_ARGUMENT', {
      name: 'absoluto',
      expected: 'NUMBER',
      received: value.type(),
    });
  }
  const num = (value as Number).value;
  return new Number(Math.abs(num));
};

const maximo: BuiltinFunction = (...args: Object[]): Object => {
  if (args.length === 0) {
    return newError('WRONG_NUMBER_OF_ARGUMENTS', { expected: 'al menos 1', received: args.length, name: 'maximo' });
  }
  
  for (const arg of args) {
    if (arg.type() !== 'NUMBER') {
      return newError('WRONG_TYPE_OF_ARGUMENT', {
        name: 'maximo',
        expected: 'NUMBER',
        received: arg.type(),
      });
    }
  }
  
  const numbers = args.map(arg => (arg as Number).value);
  return new Number(Math.max(...numbers));
};

const minimo: BuiltinFunction = (...args: Object[]): Object => {
  if (args.length === 0) {
    return newError('WRONG_NUMBER_OF_ARGUMENTS', { expected: 'al menos 1', received: args.length, name: 'minimo' });
  }
  
  for (const arg of args) {
    if (arg.type() !== 'NUMBER') {
      return newError('WRONG_TYPE_OF_ARGUMENT', {
        name: 'minimo',
        expected: 'NUMBER',
        received: arg.type(),
      });
    }
  }
  
  const numbers = args.map(arg => (arg as Number).value);
  return new Number(Math.min(...numbers));
};

const redondear: BuiltinFunction = (...args: Object[]): Object => {
  if (args.length !== 1) {
    return newError('WRONG_NUMBER_OF_ARGUMENTS', { expected: 1, received: args.length, name: 'redondear' });
  }
  const [value] = args;
  if (value.type() !== 'NUMBER') {
    return newError('WRONG_TYPE_OF_ARGUMENT', {
      name: 'redondear',
      expected: 'NUMBER',
      received: value.type(),
    });
  }
  const num = (value as Number).value;
  return new Number(Math.round(num));
};

const agregar: BuiltinFunction = (...args: Object[]): Object => {
  if (args.length !== 2) {
    return newError('WRONG_NUMBER_OF_ARGUMENTS', { expected: 2, received: args.length, name: 'agregar' });
  }
  const [array, element] = args;
  if (array.type() !== 'ARRAY') {
    return newError('WRONG_TYPE_OF_ARGUMENT', {
      name: 'agregar',
      expected: 'ARRAY',
      received: array.type(),
    });
  }
  const arr = array as ArrayValue;
  const newElements = [...arr.elements, element];
  return new ArrayValue(newElements);
};

const primero: BuiltinFunction = (...args: Object[]): Object => {
  if (args.length !== 1) {
    return newError('WRONG_NUMBER_OF_ARGUMENTS', { expected: 1, received: args.length, name: 'primero' });
  }
  const [value] = args;
  if (value.type() !== 'ARRAY') {
    return newError('WRONG_TYPE_OF_ARGUMENT', {
      name: 'primero',
      expected: 'ARRAY',
      received: value.type(),
    });
  }
  const arr = value as ArrayValue;
  if (arr.elements.length === 0) {
    return newError('EMPTY_ARRAY', { name: 'primero' });
  }
  return arr.elements[0];
};

const ultimo: BuiltinFunction = (...args: Object[]): Object => {
  if (args.length !== 1) {
    return newError('WRONG_NUMBER_OF_ARGUMENTS', { expected: 1, received: args.length, name: 'ultimo' });
  }
  const [value] = args;
  if (value.type() !== 'ARRAY') {
    return newError('WRONG_TYPE_OF_ARGUMENT', {
      name: 'ultimo',
      expected: 'ARRAY',
      received: value.type(),
    });
  }
  const arr = value as ArrayValue;
  if (arr.elements.length === 0) {
    return newError('EMPTY_ARRAY', { name: 'ultimo' });
  }
  return arr.elements[arr.elements.length - 1];
};

export const builtins: { [key: string]: Builtin } = {
  longitud: new Builtin(longitud),
  absoluto: new Builtin(absoluto),
  maximo: new Builtin(maximo),
  minimo: new Builtin(minimo),
  redondear: new Builtin(redondear),
  agregar: new Builtin(agregar),
  primero: new Builtin(primero),
  ultimo: new Builtin(ultimo),
};
