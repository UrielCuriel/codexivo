import { newError } from './errors';
import { Builtin, BuiltinFunction, Error, Number, Object, String } from './object';

const longitud: BuiltinFunction = (...args: Object[]): Object => {
  if (args.length !== 1) {
    return newError('WRONG_NUMBER_OF_ARGUMENTS', { expected: 1, received: args.length, name: 'longitud' });
  }
  if (args[0].type() !== 'STRING') {
    return newError('WRONG_TYPE_OF_ARGUMENT', { name: 'longitud', expected: 'STRING', received: args[0].type() });
  }
  return new Number((args[0] as String).value.length);
};

export const builtins: { [key: string]: Builtin } = {
  longitud: new Builtin(longitud),
};
