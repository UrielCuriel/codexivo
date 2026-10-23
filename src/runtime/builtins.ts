import { describeType, isDict, isList, repr, show, typeOf, WAIT_FOR_INPUT } from './values';
import type { DictValue, NativeContext, NativeValue, Value } from './values';

type NativeFn = (args: Value[], context: NativeContext) => Value | typeof WAIT_FOR_INPUT;

const define = (name: string, arity: NativeValue['arity'], call: NativeFn): NativeValue => ({
  kind: 'nativo',
  name,
  arity,
  call,
});

const expectNumber = (name: string, value: Value, context: NativeContext, position = ''): number => {
  if (typeof value === 'number') return value;
  throw context.fail(
    'TIPO_DE_ARGUMENTO',
    `\`${name}\` espera un número${position}, pero recibió ${describeType(typeOf(value))} (${repr(value)}).`,
  );
};

const expectList = (name: string, value: Value, context: NativeContext) => {
  if (isList(value)) return value;
  throw context.fail('TIPO_DE_ARGUMENTO', `\`${name}\` espera una lista, pero recibió ${describeType(typeOf(value))}.`);
};

const expectDict = (name: string, value: Value, context: NativeContext): DictValue => {
  if (isDict(value)) return value;
  throw context.fail(
    'TIPO_DE_ARGUMENTO',
    `\`${name}\` espera un diccionario, pero recibió ${describeType(typeOf(value))}.`,
  );
};

const expectKey = (name: string, value: Value, context: NativeContext): string | number => {
  if (typeof value === 'string' || typeof value === 'number') return value;
  throw context.fail(
    'CLAVE_INVÁLIDA',
    `\`${name}\` espera una clave de texto o número, pero recibió ${describeType(typeOf(value))}.`,
  );
};

const numbersOf = (name: string, args: Value[], context: NativeContext): number[] => {
  const values = args.length === 1 && isList(args[0]!) ? args[0].items : args;
  if (values.length === 0) {
    throw context.fail('LISTA_VACÍA', `\`${name}\` necesita al menos un número, pero la lista está vacía.`);
  }
  return values.map(value => expectNumber(name, value, context));
};

const parseNumber = (text: string): number | undefined => {
  const trimmed = text.trim();
  if (!/^[-+]?(\d+(\.\d*)?|\.\d+)$/.test(trimmed)) return undefined;
  return Number(trimmed);
};

/** Redondeo escolar: los .5 se alejan del cero (2.5 → 3, -2.5 → -3). */
const roundHalfAway = (value: number, decimals: number): number => {
  const factor = 10 ** decimals;
  return (Math.sign(value) * Math.round(Math.abs(value) * factor)) / factor;
};

/** Más elementos que esto en un `rango` es casi siempre un error, y llenaría la memoria. */
const MAX_RANGE = 10_000_000;

const library: NativeValue[] = [
  // entrada y salida
  define('imprimir', [0, Infinity], (args, context) => {
    context.write(`${args.map(show).join(' ')}\n`);
    return null;
  }),
  define('leer', 0, (_args, context) => context.readLine()),
  define('leer_número', 0, (_args, context) => {
    const line = context.readLine();
    if (line === WAIT_FOR_INPUT) return line;
    if (line === null) throw context.fail('SIN_ENTRADA', '`leer_número` no encontró más datos de entrada.');
    const value = parseNumber(line);
    if (value === undefined) {
      throw context.fail('NO_ES_NÚMERO', `\`leer_número\` esperaba un número, pero leyó ${JSON.stringify(line)}.`);
    }
    return value;
  }),

  // tipos y conversiones
  define('tipo', 1, args => typeOf(args[0]!)),
  define('texto', 1, args => show(args[0]!)),
  define('número', 1, (args, context) => {
    const value = args[0]!;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = parseNumber(value);
      if (parsed !== undefined) return parsed;
      throw context.fail('NO_ES_NÚMERO', `No se puede convertir ${JSON.stringify(value)} en número.`);
    }
    throw context.fail('TIPO_DE_ARGUMENTO', `No se puede convertir ${describeType(typeOf(value))} en número.`);
  }),
  define('longitud', 1, (args, context) => {
    const value = args[0]!;
    if (typeof value === 'string') return [...value].length;
    if (isList(value)) return value.items.length;
    if (isDict(value)) return value.entries.size;
    throw context.fail(
      'TIPO_DE_ARGUMENTO',
      `\`longitud\` espera un texto, una lista o un diccionario, pero recibió ${describeType(typeOf(value))}.`,
    );
  }),

  // matemáticas
  define('absoluto', 1, (args, context) => Math.abs(expectNumber('absoluto', args[0]!, context))),
  define('máximo', [1, Infinity], (args, context) => Math.max(...numbersOf('máximo', args, context))),
  define('mínimo', [1, Infinity], (args, context) => Math.min(...numbersOf('mínimo', args, context))),
  define('redondear', [1, 2], (args, context) => {
    const value = expectNumber('redondear', args[0]!, context);
    const decimals = args.length > 1 ? expectNumber('redondear', args[1]!, context, ' de decimales') : 0;
    if (!Number.isInteger(decimals) || decimals < 0) {
      throw context.fail(
        'TIPO_DE_ARGUMENTO',
        'La cantidad de decimales de `redondear` tiene que ser un entero positivo o 0.',
      );
    }
    return roundHalfAway(value, decimals);
  }),

  // listas
  define('agregar', 2, (args, context) => {
    expectList('agregar', args[0]!, context).items.push(args[1]!);
    return null;
  }),
  define('rango', [2, 3], (args, context) => {
    const start = expectNumber('rango', args[0]!, context, ' como inicio');
    const end = expectNumber('rango', args[1]!, context, ' como final');
    const step = args.length > 2 ? expectNumber('rango', args[2]!, context, ' como paso') : 1;
    if (step === 0) {
      throw context.fail(
        'RANGO_PASO_CERO',
        'El paso de `rango` no puede ser 0: nunca llegaría al final.',
        'Usa un paso positivo para contar hacia arriba o uno negativo para contar hacia abajo.',
      );
    }
    // Se tolera un error de redondeo pequeño para que `rango(0, 1, 0.1)` incluya el 1.
    const count = Math.floor((end - start) / step + 1e-9) + 1;
    if (!Number.isFinite(count)) throw context.fail('TIPO_DE_ARGUMENTO', '`rango` necesita números finitos.');
    if (count > MAX_RANGE) {
      throw context.fail(
        'RANGO_DEMASIADO_GRANDE',
        `\`rango\` produciría ${count} números; el máximo es ${MAX_RANGE}.`,
        'Revisa el inicio, el final y el paso.',
      );
    }
    return context.newList(Array.from({ length: Math.max(0, count) }, (_, index) => start + index * step));
  }),
  define('índices', 1, (args, context) => {
    const value = args[0]!;
    if (typeof value !== 'string' && !isList(value)) {
      throw context.fail(
        'TIPO_DE_ARGUMENTO',
        `\`índices\` espera una lista o un texto, pero recibió ${describeType(typeOf(value))}.`,
      );
    }
    const length = typeof value === 'string' ? value.length : value.items.length;
    return context.newList(Array.from({ length }, (_, index) => index));
  }),
  define('quitar', 2, (args, context) => {
    const container = args[0]!;
    if (isDict(container)) {
      const key = expectKey('quitar', args[1]!, context);
      if (!container.entries.has(key)) {
        throw context.fail(
          'CLAVE_INEXISTENTE',
          `\`quitar\` no encontró la clave ${repr(key)} en el diccionario.`,
          `Usa \`tiene(d, ${repr(key)})\` para preguntar antes de quitarla.`,
        );
      }
      const value = container.entries.get(key)!;
      container.entries.delete(key);
      return value;
    }
    if (!isList(container)) {
      throw context.fail(
        'TIPO_DE_ARGUMENTO',
        `\`quitar\` espera una lista o un diccionario, pero recibió ${describeType(typeOf(container))}.`,
      );
    }
    const index = args[1]!;
    if (typeof index !== 'number' || !Number.isInteger(index)) {
      throw context.fail('ÍNDICE_INVÁLIDO', `El índice tiene que ser un número entero, pero es ${repr(index)}.`);
    }
    const length = container.items.length;
    const position = index < 0 ? length + index : index;
    if (position < 0 || position >= length) {
      throw context.fail(
        'ÍNDICE_FUERA_DE_RANGO',
        `El índice ${index} está fuera de la lista, que tiene ${length} ${length === 1 ? 'elemento' : 'elementos'}.`,
        length === 0
          ? 'La lista está vacía.'
          : `Los índices válidos van de 0 a ${length - 1} (o de -1 a -${length} desde el final).`,
      );
    }
    return container.items.splice(position, 1)[0]!;
  }),
  define('primero', 1, (args, context) => {
    const list = expectList('primero', args[0]!, context);
    if (list.items.length === 0) throw context.fail('LISTA_VACÍA', '`primero` no puede tomar nada de una lista vacía.');
    return list.items[0]!;
  }),
  define('último', 1, (args, context) => {
    const list = expectList('último', args[0]!, context);
    if (list.items.length === 0) throw context.fail('LISTA_VACÍA', '`último` no puede tomar nada de una lista vacía.');
    return list.items[list.items.length - 1]!;
  }),

  // diccionarios
  define('claves', 1, (args, context) => context.newList([...expectDict('claves', args[0]!, context).entries.keys()])),
  define('valores', 1, (args, context) =>
    context.newList([...expectDict('valores', args[0]!, context).entries.values()]),
  ),
  define('tiene', 2, (args, context) =>
    expectDict('tiene', args[0]!, context).entries.has(expectKey('tiene', args[1]!, context)),
  ),
];

/** Constantes de la biblioteca. Una variable del usuario con el mismo nombre las oculta. */
export const constants: Readonly<Record<string, Value>> = {
  PI: Math.PI,
};

/** Quita los acentos agudos y la diéresis, pero conserva la ñ. */
export const withoutAccents = (name: string): string =>
  name.replace(/[áéíóúü]/g, character => ({ á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u' })[character] ?? character);

/** Biblioteca estándar. Cada nombre con acento también se acepta sin él (`máximo` y `maximo`). */
export const natives: Record<string, NativeValue> = (() => {
  const table: Record<string, NativeValue> = {};
  for (const native of library) table[native.name] = native;
  for (const native of library) {
    const alias = withoutAccents(native.name);
    if (!table[alias]) table[alias] = native;
  }
  return table;
})();
