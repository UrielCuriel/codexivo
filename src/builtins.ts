import { newError } from './errors';
import { Array as ArrayValue, Boolean, Builtin, BuiltinFunction, Dictionary as DictionaryValue, Domain, Error, Number, Object, String } from './object';

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
  if (value.type() === 'DICTIONARY') {
    return new Number((value as DictionaryValue).pairs.size);
  }
  return newError('WRONG_TYPE_OF_ARGUMENT', {
    name: 'longitud',
    expected: 'STRING, ARREGLO o DICCIONARIO',
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

// Dictionary builtin functions
const claves: BuiltinFunction = (...args: Object[]): Object => {
  if (args.length !== 1) {
    return newError('WRONG_NUMBER_OF_ARGUMENTS', { expected: 1, received: args.length, name: 'claves' });
  }
  const [value] = args;
  if (value.type() !== 'DICTIONARY') {
    return newError('WRONG_TYPE_OF_ARGUMENT', {
      name: 'claves',
      expected: 'DICTIONARY',
      received: value.type(),
    });
  }
  const dict = value as DictionaryValue;
  const keys: Object[] = [];
  for (const [key] of dict.pairs.entries()) {
    keys.push(new String(key));
  }
  return new ArrayValue(keys);
};

const valores: BuiltinFunction = (...args: Object[]): Object => {
  if (args.length !== 1) {
    return newError('WRONG_NUMBER_OF_ARGUMENTS', { expected: 1, received: args.length, name: 'valores' });
  }
  const [value] = args;
  if (value.type() !== 'DICTIONARY') {
    return newError('WRONG_TYPE_OF_ARGUMENT', {
      name: 'valores',
      expected: 'DICTIONARY',
      received: value.type(),
    });
  }
  const dict = value as DictionaryValue;
  const values: Object[] = [];
  for (const [, value] of dict.pairs.entries()) {
    values.push(value);
  }
  return new ArrayValue(values);
};

const tiene_clave: BuiltinFunction = (...args: Object[]): Object => {
  if (args.length !== 2) {
    return newError('WRONG_NUMBER_OF_ARGUMENTS', { expected: 2, received: args.length, name: 'tiene_clave' });
  }
  const [dictArg, keyArg] = args;
  if (dictArg.type() !== 'DICTIONARY') {
    return newError('WRONG_TYPE_OF_ARGUMENT', {
      name: 'tiene_clave',
      expected: 'DICTIONARY',
      received: dictArg.type(),
    });
  }
  
  let keyString: string;
  if (keyArg.type() === 'STRING') {
    keyString = (keyArg as String).value;
  } else if (keyArg.type() === 'NUMBER') {
    keyString = (keyArg as Number).value.toString();
  } else {
    return newError('WRONG_TYPE_OF_ARGUMENT', {
      name: 'tiene_clave',
      expected: 'STRING o NUMBER',
      received: keyArg.type(),
    });
  }
  
  const dict = dictArg as DictionaryValue;
  const hasKey = dict.pairs.has(keyString);
  
  return new Boolean(hasKey);
};

// Organize builtins into domains
const matesDomain = new Domain('mates', new Map([
  ['absoluto', new Builtin(absoluto)],
  ['maximo', new Builtin(maximo)],
  ['minimo', new Builtin(minimo)],
  ['redondear', new Builtin(redondear)],
]));

const arreglosDomain = new Domain('arreglos', new Map([
  ['agregar', new Builtin(agregar)],
  ['primero', new Builtin(primero)],
  ['ultimo', new Builtin(ultimo)],
]));

const diccionariosDomain = new Domain('diccionarios', new Map([
  ['claves', new Builtin(claves)],
  ['valores', new Builtin(valores)],
  ['tiene_clave', new Builtin(tiene_clave)],
]));

export const builtins: { [key: string]: Builtin } = {
  longitud: new Builtin(longitud),
  absoluto: new Builtin(absoluto),
  maximo: new Builtin(maximo),
  minimo: new Builtin(minimo),
  redondear: new Builtin(redondear),
  agregar: new Builtin(agregar),
  primero: new Builtin(primero),
  ultimo: new Builtin(ultimo),
  claves: new Builtin(claves),
  valores: new Builtin(valores),
  tiene_clave: new Builtin(tiene_clave),
};

export const domains: { [key: string]: Domain } = {
  mates: matesDomain,
  arreglos: arreglosDomain,
  diccionarios: diccionariosDomain,
};
