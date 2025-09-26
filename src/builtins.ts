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

export const builtins: { [key: string]: Builtin } = {
  longitud: new Builtin(longitud),
};
