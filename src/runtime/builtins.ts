import { describeType, isDict, isList, repr, show, typeOf, WAIT_FOR_INPUT } from './values';
import { equals } from './values';
import type { DictValue, ListValue, NativeContext, NativeValue, Value } from './values';

type NativeFn = (args: Value[], context: NativeContext) => Value | typeof WAIT_FOR_INPUT;

const define = (name: string, arity: NativeValue['arity'], call: NativeFn, cost?: NativeValue['cost']): NativeValue =>
  cost ? { kind: 'nativo', name, arity, call, cost } : { kind: 'nativo', name, arity, call };

// ── costos (§10) ─────────────────────────────────────────────────────────────

/** Tamaño de un texto, lista o diccionario; 1 para lo demás. */
const sizeOf = (value: Value | undefined): number => {
  if (typeof value === 'string') return value.length;
  if (value !== undefined && isList(value)) return value.items.length;
  if (value !== undefined && isDict(value)) return value.entries.size;
  return 1;
};

/** Cuesta tanto como el tamaño de su primer argumento (al menos 1). */
const linear = (args: Value[]): number => Math.max(1, sizeOf(args[0]));

/** `n · ⌈log₂ n⌉`, al menos 1: lo que cuesta ordenar `n` elementos. */
const nLogN = (args: Value[]): number => {
  const n = sizeOf(args[0]);
  return Math.max(1, n * Math.ceil(Math.log2(Math.max(n, 1))));
};

/** Cuesta tantas casillas como crea. */
const created = (count: (args: Value[]) => number) => (args: Value[]) => Math.max(1, count(args));

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

const expectText = (name: string, value: Value, context: NativeContext, position = ''): string => {
  if (typeof value === 'string') return value;
  throw context.fail(
    'TIPO_DE_ARGUMENTO',
    `\`${name}\` espera un texto${position}, pero recibió ${describeType(typeOf(value))} (${repr(value)}).`,
  );
};

const expectInteger = (name: string, value: Value, context: NativeContext, position = ''): number => {
  const number = expectNumber(name, value, context, position);
  if (Number.isInteger(number)) return number;
  throw context.fail(
    'TIPO_DE_ARGUMENTO',
    `\`${name}\` espera un número entero${position}, pero recibió ${repr(number)}.`,
    'Redondea el valor con `redondear(…)`, `piso(…)` o `techo(…)`.',
  );
};

const expectCount = (name: string, value: Value, context: NativeContext, position = ''): number => {
  const count = expectInteger(name, value, context, position);
  if (count >= 0 && count <= MAX_RANGE) return count;
  throw context.fail(
    'TIPO_DE_ARGUMENTO',
    count < 0
      ? `\`${name}\` necesita una cantidad de 0 o más${position}, pero recibió ${count}.`
      : `\`${name}\` produciría ${count} elementos; el máximo es ${MAX_RANGE}.`,
  );
};

/** Mismo mensaje que el operador `[ ]` cuando el índice no cabe. */
const outOfRange = (index: number, length: number, list: boolean, context: NativeContext) => {
  const what = list ? 'la lista' : 'el texto';
  const unit = list ? (length === 1 ? 'elemento' : 'elementos') : length === 1 ? 'carácter' : 'caracteres';
  return context.fail(
    'ÍNDICE_FUERA_DE_RANGO',
    `El índice ${index} está fuera de ${what}, que tiene ${length} ${unit}.`,
    length === 0
      ? list
        ? 'La lista está vacía.'
        : 'El texto está vacío.'
      : `Los índices válidos van de 0 a ${length - 1} (o de -1 a -${length} desde el final).`,
  );
};

/**
 * Posición real de `value` en algo de longitud `length`. Los negativos cuentan desde el final. Con
 * `allowEnd`, `length` también vale (para `insertar` al final o como fin de `rebanar`).
 */
const positionIn = (
  name: string,
  value: Value,
  length: number,
  list: boolean,
  context: NativeContext,
  allowEnd = false,
): number => {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw context.fail('ÍNDICE_INVÁLIDO', `\`${name}\` necesita un índice entero, pero recibió ${repr(value)}.`);
  }
  const position = value < 0 ? length + value : value;
  if (position < 0 || position > length || (position === length && !allowEnd)) {
    throw outOfRange(value, length, list, context);
  }
  return position;
};

/** Copia una lista o un diccionario y todo lo que contiene, para no compartir casillas por accidente. */
const deepCopy = (value: Value, context: NativeContext, copies = new Map<Value, Value>()): Value => {
  if (!isList(value) && !isDict(value)) return value;
  const done = copies.get(value);
  if (done) return done;
  if (isList(value)) {
    const copy = context.newList([]);
    copies.set(value, copy);
    for (const item of value.items) copy.items.push(deepCopy(item, context, copies));
    return copy;
  }
  const copy = context.newDict(new Map());
  copies.set(value, copy);
  for (const [key, item] of value.entries) copy.entries.set(key, deepCopy(item, context, copies));
  return copy;
};

const emptyListError = (name: string, context: NativeContext) =>
  context.fail('LISTA_VACÍA', `\`${name}\` no puede tomar nada de una lista vacía.`);

/** Para `contiene` y `posición_de`, que con una lista ya se resolvieron: el valor tiene que ser un texto. */
const expectTextOrList = (name: string, value: Value, context: NativeContext): string => {
  if (typeof value === 'string') return value;
  throw context.fail(
    'TIPO_DE_ARGUMENTO',
    `\`${name}\` espera un texto o una lista, pero recibió ${describeType(typeOf(value))}.`,
  );
};

/** Inicio y fin (sin incluirlo) de `subtexto` y `rebanar`, con la misma convención que `[ ]`. */
const sliceBounds = (
  name: string,
  args: Value[],
  length: number,
  list: boolean,
  context: NativeContext,
): [number, number] => {
  const start = positionIn(name, args[1]!, length, list, context, true);
  const end = positionIn(name, args[2]!, length, list, context, true);
  if (start > end) {
    throw context.fail(
      'RANGO_INVÁLIDO',
      `\`${name}\` necesita que el inicio (${repr(args[1]!)}) no esté después del fin (${repr(args[2]!)}).`,
      'El fin no se incluye: `subtexto("hola", 1, 3)` es `"ol"`.',
    );
  }
  return [start, end];
};

const sliceLength = (args: Value[]): number =>
  typeof args[1] === 'number' && typeof args[2] === 'number' ? Math.abs(args[2] - args[1]) : 1;

/** Compara para `ordenar`: todos números o todos textos. */
const sortableKind = (list: ListValue, context: NativeContext): 'número' | 'texto' => {
  const first = list.items[0];
  const kind = typeof first === 'string' ? 'texto' : 'número';
  for (const item of list.items) {
    if (typeOf(item) !== kind) {
      throw context.fail(
        'TIPO_DE_ARGUMENTO',
        `\`ordenar\` necesita que todos los elementos sean números o todos textos, pero encontró ${describeType(typeOf(item))} (${repr(item)}).`,
      );
    }
  }
  return kind;
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

/** Más elementos que esto en una lista creada de golpe es casi siempre un error, y llenaría la memoria. */
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

  // matemáticas
  define('piso', 1, (args, context) => Math.floor(expectNumber('piso', args[0]!, context))),
  define('techo', 1, (args, context) => Math.ceil(expectNumber('techo', args[0]!, context))),
  define('entero', 1, (args, context) => Math.trunc(expectNumber('entero', args[0]!, context))),
  define('raíz', 1, (args, context) => {
    const value = expectNumber('raíz', args[0]!, context);
    if (value < 0) {
      throw context.fail(
        'RAÍZ_DE_NEGATIVO',
        `\`raíz\` no tiene un resultado real para ${repr(value)}.`,
        'La raíz cuadrada solo existe para números de 0 en adelante. ¿Quisiste usar `absoluto(…)` antes?',
      );
    }
    return Math.sqrt(value);
  }),
  define('aleatorio', 2, (args, context) => {
    const low = expectInteger('aleatorio', args[0]!, context, ' como mínimo');
    const high = expectInteger('aleatorio', args[1]!, context, ' como máximo');
    if (low > high) {
      throw context.fail(
        'TIPO_DE_ARGUMENTO',
        `\`aleatorio\` necesita que el mínimo (${low}) no sea mayor que el máximo (${high}).`,
      );
    }
    return low + Math.floor(context.random() * (high - low + 1));
  }),

  // texto
  define(
    'mayúsculas',
    1,
    (args, context) => expectText('mayúsculas', args[0]!, context).toLocaleUpperCase('es'),
    linear,
  ),
  define(
    'minúsculas',
    1,
    (args, context) => expectText('minúsculas', args[0]!, context).toLocaleLowerCase('es'),
    linear,
  ),
  define('recortar', 1, (args, context) => expectText('recortar', args[0]!, context).trim(), linear),
  define(
    'dividir',
    2,
    (args, context) => {
      const text = expectText('dividir', args[0]!, context);
      const separator = expectText('dividir', args[1]!, context, ' como separador');
      if (separator === '') {
        throw context.fail(
          'SEPARADOR_VACÍO',
          '`dividir` necesita un separador que no esté vacío.',
          'Para separar un texto letra por letra usa `caracteres(t)`.',
        );
      }
      return context.newList(text.split(separator));
    },
    linear,
  ),
  define(
    'unir',
    2,
    (args, context) => {
      const list = expectList('unir', args[0]!, context);
      const separator = expectText('unir', args[1]!, context, ' como separador');
      return list.items.map(show).join(separator);
    },
    linear,
  ),
  define(
    'reemplazar',
    3,
    (args, context) => {
      const text = expectText('reemplazar', args[0]!, context);
      const search = expectText('reemplazar', args[1]!, context, ' para buscar');
      const replacement = expectText('reemplazar', args[2]!, context, ' para poner');
      if (search === '') {
        throw context.fail('SEPARADOR_VACÍO', '`reemplazar` necesita un texto que buscar que no esté vacío.');
      }
      return text.replaceAll(search, replacement);
    },
    linear,
  ),
  define(
    'contiene',
    2,
    (args, context) => {
      const container = args[0]!;
      if (isList(container)) return container.items.some(item => equals(item, args[1]!));
      return expectTextOrList('contiene', container, context).includes(
        expectText('contiene', args[1]!, context, ' para buscar'),
      );
    },
    linear,
  ),
  define(
    'posición_de',
    2,
    (args, context) => {
      const container = args[0]!;
      if (isList(container)) return container.items.findIndex(item => equals(item, args[1]!));
      return expectTextOrList('posición_de', container, context).indexOf(
        expectText('posición_de', args[1]!, context, ' para buscar'),
      );
    },
    linear,
  ),
  define(
    'empieza_con',
    2,
    (args, context) =>
      expectText('empieza_con', args[0]!, context).startsWith(
        expectText('empieza_con', args[1]!, context, ' como inicio'),
      ),
    args => Math.max(1, sizeOf(args[1])),
  ),
  define(
    'termina_con',
    2,
    (args, context) =>
      expectText('termina_con', args[0]!, context).endsWith(
        expectText('termina_con', args[1]!, context, ' como final'),
      ),
    args => Math.max(1, sizeOf(args[1])),
  ),
  define(
    'subtexto',
    3,
    (args, context) => {
      const text = expectText('subtexto', args[0]!, context);
      const [start, end] = sliceBounds('subtexto', args, text.length, false, context);
      return text.slice(start, end);
    },
    created(args => sliceLength(args)),
  ),
  define('caracteres', 1, (args, context) => context.newList([...expectText('caracteres', args[0]!, context)]), linear),
  define('código_de', 1, (args, context) => {
    const text = expectText('código_de', args[0]!, context);
    const characters = [...text];
    if (characters.length !== 1) {
      throw context.fail(
        'TIPO_DE_ARGUMENTO',
        `\`código_de\` espera un solo carácter, pero recibió ${repr(text)}.`,
        'Para un texto más largo, recorre `caracteres(t)`.',
      );
    }
    return characters[0]!.codePointAt(0)!;
  }),
  define('carácter_de', 1, (args, context) => {
    const code = expectInteger('carácter_de', args[0]!, context);
    if (code < 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
      throw context.fail('TIPO_DE_ARGUMENTO', `${code} no es el código de ningún carácter.`);
    }
    return String.fromCodePoint(code);
  }),

  // listas que cambian
  define(
    'insertar',
    3,
    (args, context) => {
      const list = expectList('insertar', args[0]!, context);
      const position = positionIn('insertar', args[1]!, list.items.length, true, context, true);
      list.items.splice(position, 0, args[2]!);
      return null;
    },
    linear,
  ),
  define('quitar_último', 1, (args, context) => {
    const list = expectList('quitar_último', args[0]!, context);
    if (list.items.length === 0) throw emptyListError('quitar_último', context);
    return list.items.pop()!;
  }),
  define(
    'quitar_primero',
    1,
    (args, context) => {
      const list = expectList('quitar_primero', args[0]!, context);
      if (list.items.length === 0) throw emptyListError('quitar_primero', context);
      return list.items.shift()!;
    },
    linear,
  ),
  define('vaciar', 1, (args, context) => {
    const container = args[0]!;
    if (isDict(container)) container.entries.clear();
    else expectList('vaciar', container, context).items.length = 0;
    return null;
  }),

  // listas nuevas
  define(
    'rebanar',
    3,
    (args, context) => {
      const list = expectList('rebanar', args[0]!, context);
      const [start, end] = sliceBounds('rebanar', args, list.items.length, true, context);
      return context.newList(list.items.slice(start, end));
    },
    created(args => sliceLength(args)),
  ),
  define(
    'invertir',
    1,
    (args, context) => {
      const value = args[0]!;
      if (typeof value === 'string') return [...value].reverse().join('');
      if (isList(value)) return context.newList([...value.items].reverse());
      throw context.fail(
        'TIPO_DE_ARGUMENTO',
        `\`invertir\` espera una lista o un texto, pero recibió ${describeType(typeOf(value))}.`,
      );
    },
    linear,
  ),
  define(
    'ordenar',
    1,
    (args, context) => {
      const list = expectList('ordenar', args[0]!, context);
      const kind = sortableKind(list, context);
      // `sort` de JavaScript es estable; los textos se comparan carácter por carácter, igual que `<`.
      const items = [...list.items].sort((a, b) =>
        kind === 'número' ? (a as number) - (b as number) : a! < b! ? -1 : a! > b! ? 1 : 0,
      );
      return context.newList(items);
    },
    nLogN,
  ),
  define(
    'copiar',
    1,
    (args, context) => {
      const value = args[0]!;
      if (isDict(value)) return context.newDict(new Map(value.entries));
      return context.newList([...expectList('copiar', value, context).items]);
    },
    linear,
  ),
  define(
    'sumar',
    1,
    (args, context) =>
      expectList('sumar', args[0]!, context).items.reduce<number>(
        (total, item) => total + expectNumber('sumar', item, context, ' en cada elemento'),
        0,
      ),
    linear,
  ),
  define(
    'lista_de',
    2,
    (args, context) => {
      const count = expectCount('lista_de', args[0]!, context, ' como cantidad');
      return context.newList(Array.from({ length: count }, () => deepCopy(args[1]!, context)));
    },
    created(args => (typeof args[0] === 'number' ? args[0] * sizeOf(args[1]) : 1)),
  ),
  define(
    'matriz',
    3,
    (args, context) => {
      const rows = expectCount('matriz', args[0]!, context, ' como filas');
      const columns = expectCount('matriz', args[1]!, context, ' como columnas');
      if (rows * columns > MAX_RANGE) {
        throw context.fail(
          'TIPO_DE_ARGUMENTO',
          `\`matriz\` produciría ${rows * columns} casillas; el máximo es ${MAX_RANGE}.`,
        );
      }
      return context.newList(
        Array.from({ length: rows }, () =>
          context.newList(Array.from({ length: columns }, () => deepCopy(args[2]!, context))),
        ),
      );
    },
    created(args => (typeof args[0] === 'number' && typeof args[1] === 'number' ? args[0] * args[1] : 1)),
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
