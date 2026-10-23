import { describeType, isCallable, isDict, isList, repr, show, typeOf, WAIT_FOR_INPUT } from './values';
import { COSTS } from './costs';
import { equals } from './values';
import type { DictValue, ListValue, NativeContext, NativeValue, ProcedureDoc, Value } from './values';

type NativeFn = (args: Value[], context: NativeContext) => Value | typeof WAIT_FOR_INPUT;

/**
 * Define un procedimiento de la biblioteca. La documentación es obligatoria: de ahí sale el catálogo que usan el
 * sitio, el editor y las pruebas. El costo vive en `costs.ts`, en una sola tabla.
 */
const define = (name: string, arity: NativeValue['arity'], doc: ProcedureDoc, call: NativeFn): NativeValue => {
  const cost = COSTS[name];
  return { kind: 'nativo', name, arity, call, doc, ...(cost ? { cost } : {}) };
};

/** Un nativo que solo ve la biblioteca escrita en Codexivo: no se documenta porque el programa no lo ve. */
const internal = (name: string, arity: NativeValue['arity'], call: NativeFn): NativeValue => ({
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

/** Una pila o una cola es una lista; los mensajes usan su propio vocabulario. */
const expectStructure = (name: string, kind: 'pila' | 'cola', value: Value, context: NativeContext): ListValue => {
  if (isList(value)) return value;
  throw context.fail(
    'TIPO_DE_ARGUMENTO',
    `\`${name}\` espera una ${kind} (una lista), pero recibió ${describeType(typeOf(value))}.`,
    `Una ${kind} empieza como una lista vacía: \`variable ${kind} = [];\`.`,
  );
};

const emptyStructure = (name: string, kind: 'pila' | 'cola', context: NativeContext) =>
  context.fail(
    kind === 'pila' ? 'PILA_VACÍA' : 'COLA_VACÍA',
    name === 'tope' || name === 'frente'
      ? `Una ${kind} vacía no tiene \`${name}\`.`
      : `No se puede \`${name}\` de una ${kind} vacía.`,
    `Revisa antes con \`longitud(${kind}) > 0\`.`,
  );

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
  define(
    'imprimir',
    [0, Infinity],
    {
      level: 'principiante',
      category: 'entrada y salida',
      params: [{ name: 'valor', type: 'cualquiera', optional: true }],
      variadic: true,
      returns: 'nulo',
      description:
        'Escribe los valores separados por un espacio y termina la línea. Los textos se escriben sin comillas.',
      examples: [{ code: 'imprimir("Hola,", "Ana", 16)', output: 'Hola, Ana 16\n' }],
    },
    (args, context) => {
      context.write(`${args.map(show).join(' ')}\n`);
      return null;
    },
  ),
  define(
    'leer',
    0,
    {
      level: 'principiante',
      category: 'entrada y salida',
      params: [],
      returns: 'texto | nulo',
      description: 'Lee la siguiente línea de entrada como texto. Si ya no hay más entrada, regresa `nulo`.',
      examples: [{ code: 'leer()', result: 'nulo' }],
    },
    (_args, context) => context.readLine(),
  ),
  define(
    'leer_número',
    0,
    {
      level: 'principiante',
      category: 'entrada y salida',
      params: [],
      returns: 'número',
      description: 'Lee la siguiente línea de entrada y la convierte en número. Si no es un número, es un error.',
      examples: [{ code: 'variable edad = 0\nsi (falso) { edad = leer_número() }\nedad', result: '0' }],
    },
    (_args, context) => {
      const line = context.readLine();
      if (line === WAIT_FOR_INPUT) return line;
      if (line === null) throw context.fail('SIN_ENTRADA', '`leer_número` no encontró más datos de entrada.');
      const value = parseNumber(line);
      if (value === undefined) {
        throw context.fail('NO_ES_NÚMERO', `\`leer_número\` esperaba un número, pero leyó ${JSON.stringify(line)}.`);
      }
      return value;
    },
  ),

  // tipos y conversiones
  define(
    'tipo',
    1,
    {
      level: 'principiante',
      category: 'tipos',
      params: [{ name: 'x', type: 'cualquiera' }],
      returns: 'texto',
      description:
        'El nombre del tipo de un valor: "número", "texto", "lógico", "nulo", "lista", "diccionario", "dominio" o "procedimiento".',
      examples: [
        { code: 'tipo(3.5)', result: '"número"' },
        { code: 'tipo([1, 2])', result: '"lista"' },
      ],
    },
    args => typeOf(args[0]!),
  ),
  define(
    'texto',
    1,
    {
      level: 'principiante',
      category: 'tipos',
      params: [{ name: 'x', type: 'cualquiera' }],
      returns: 'texto',
      description: 'Convierte cualquier valor en texto, como lo escribiría `imprimir`.',
      examples: [{ code: 'texto(42) + "!"', result: '"42!"' }],
    },
    args => show(args[0]!),
  ),
  define(
    'número',
    1,
    {
      level: 'principiante',
      category: 'tipos',
      params: [{ name: 'x', type: 'texto | número' }],
      returns: 'número',
      description: 'Convierte un texto en número. Si el texto no es un número, es un error.',
      examples: [{ code: 'número("3.5") * 2', result: '7' }],
    },
    (args, context) => {
      const value = args[0]!;
      if (typeof value === 'number') return value;
      if (typeof value === 'string') {
        const parsed = parseNumber(value);
        if (parsed !== undefined) return parsed;
        throw context.fail('NO_ES_NÚMERO', `No se puede convertir ${JSON.stringify(value)} en número.`);
      }
      throw context.fail('TIPO_DE_ARGUMENTO', `No se puede convertir ${describeType(typeOf(value))} en número.`);
    },
  ),
  define(
    'longitud',
    1,
    {
      level: 'principiante',
      category: 'tipos',
      params: [{ name: 'x', type: 'texto | lista | diccionario' }],
      returns: 'número',
      description: 'Cuántos caracteres tiene un texto, cuántos elementos una lista o cuántas claves un diccionario.',
      examples: [
        { code: 'longitud("año")', result: '3' },
        { code: 'longitud([1, 2, 3])', result: '3' },
      ],
    },
    (args, context) => {
      const value = args[0]!;
      if (typeof value === 'string') return [...value].length;
      if (isList(value)) return value.items.length;
      if (isDict(value)) return value.entries.size;
      throw context.fail(
        'TIPO_DE_ARGUMENTO',
        `\`longitud\` espera un texto, una lista o un diccionario, pero recibió ${describeType(typeOf(value))}.`,
      );
    },
  ),

  // matemáticas
  define(
    'absoluto',
    1,
    {
      level: 'principiante',
      category: 'matemáticas',
      params: [{ name: 'x', type: 'número' }],
      returns: 'número',
      description: 'El valor absoluto: la distancia del número al 0.',
      examples: [{ code: 'absoluto(-3)', result: '3' }],
    },
    (args, context) => Math.abs(expectNumber('absoluto', args[0]!, context)),
  ),
  define(
    'máximo',
    [1, Infinity],
    {
      level: 'principiante',
      category: 'matemáticas',
      params: [{ name: 'números', type: 'número | lista' }],
      variadic: true,
      returns: 'número',
      description: 'El mayor de varios números, o de los números de una lista.',
      examples: [
        { code: 'máximo(3, 9, 2)', result: '9' },
        { code: 'máximo([4, 1])', result: '4' },
      ],
    },
    (args, context) => Math.max(...numbersOf('máximo', args, context)),
  ),
  define(
    'mínimo',
    [1, Infinity],
    {
      level: 'principiante',
      category: 'matemáticas',
      params: [{ name: 'números', type: 'número | lista' }],
      variadic: true,
      returns: 'número',
      description: 'El menor de varios números, o de los números de una lista.',
      examples: [{ code: 'mínimo(3, 9, 2)', result: '2' }],
    },
    (args, context) => Math.min(...numbersOf('mínimo', args, context)),
  ),
  define(
    'redondear',
    [1, 2],
    {
      level: 'principiante',
      category: 'matemáticas',
      params: [
        { name: 'x', type: 'número' },
        { name: 'decimales', type: 'número', optional: true },
      ],
      returns: 'número',
      description: 'Redondea al entero más cercano, o a cierta cantidad de decimales. Los .5 se alejan del cero.',
      examples: [
        { code: 'redondear(2.5)', result: '3' },
        { code: 'redondear(3.14159, 2)', result: '3.14' },
      ],
    },
    (args, context) => {
      const value = expectNumber('redondear', args[0]!, context);
      const decimals = args.length > 1 ? expectNumber('redondear', args[1]!, context, ' de decimales') : 0;
      if (!Number.isInteger(decimals) || decimals < 0) {
        throw context.fail(
          'TIPO_DE_ARGUMENTO',
          'La cantidad de decimales de `redondear` tiene que ser un entero positivo o 0.',
        );
      }
      return roundHalfAway(value, decimals);
    },
  ),

  // listas
  define(
    'agregar',
    2,
    {
      level: 'principiante',
      category: 'listas',
      params: [
        { name: 'lista', type: 'lista' },
        { name: 'x', type: 'cualquiera' },
      ],
      returns: 'nulo',
      mutates: true,
      description: 'Agrega `x` al final de la lista.',
      examples: [{ code: 'variable l = [1]\nagregar(l, 2)\nl', result: '[1, 2]' }],
    },
    (args, context) => {
      expectList('agregar', args[0]!, context).items.push(args[1]!);
      return null;
    },
  ),
  define(
    'rango',
    [2, 3],
    {
      level: 'intermedio',
      category: 'listas',
      params: [
        { name: 'inicio', type: 'número' },
        { name: 'fin', type: 'número' },
        { name: 'paso', type: 'número', optional: true },
      ],
      returns: 'lista',
      description: 'Lista de números de `inicio` a `fin`, incluyendo `fin`. Con un paso negativo cuenta hacia abajo.',
      examples: [
        { code: 'rango(1, 5)', result: '[1, 2, 3, 4, 5]' },
        { code: 'rango(10, 0, -5)', result: '[10, 5, 0]' },
      ],
    },
    (args, context) => {
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
    },
  ),
  define(
    'índices',
    1,
    {
      level: 'intermedio',
      category: 'listas',
      params: [{ name: 'lista', type: 'lista | texto' }],
      returns: 'lista',
      description: 'Las posiciones válidas de una lista o texto, de 0 a `longitud - 1`.',
      examples: [{ code: 'índices(["a", "b", "c"])', result: '[0, 1, 2]' }],
    },
    (args, context) => {
      const value = args[0]!;
      if (typeof value !== 'string' && !isList(value)) {
        throw context.fail(
          'TIPO_DE_ARGUMENTO',
          `\`índices\` espera una lista o un texto, pero recibió ${describeType(typeOf(value))}.`,
        );
      }
      const length = typeof value === 'string' ? value.length : value.items.length;
      return context.newList(Array.from({ length }, (_, index) => index));
    },
  ),
  define(
    'quitar',
    2,
    {
      level: 'intermedio',
      category: 'listas',
      params: [
        { name: 'lista', type: 'lista | diccionario' },
        { name: 'posición', type: 'número | texto' },
      ],
      returns: 'cualquiera',
      mutates: true,
      description:
        'Quita el elemento en esa posición de una lista, o esa clave de un diccionario, y regresa lo que quitó.',
      examples: [
        { code: 'variable l = [1, 2, 3]\n[quitar(l, 0), l]', result: '[1, [2, 3]]' },
        { code: 'variable d = { "a": 1 }\n[quitar(d, "a"), d]', result: '[1, {}]' },
      ],
    },
    (args, context) => {
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
    },
  ),
  define(
    'primero',
    1,
    {
      level: 'principiante',
      category: 'listas',
      params: [{ name: 'lista', type: 'lista' }],
      returns: 'cualquiera',
      description: 'El primer elemento de la lista.',
      examples: [{ code: 'primero([7, 8, 9])', result: '7' }],
    },
    (args, context) => {
      const list = expectList('primero', args[0]!, context);
      if (list.items.length === 0)
        throw context.fail('LISTA_VACÍA', '`primero` no puede tomar nada de una lista vacía.');
      return list.items[0]!;
    },
  ),
  define(
    'último',
    1,
    {
      level: 'principiante',
      category: 'listas',
      params: [{ name: 'lista', type: 'lista' }],
      returns: 'cualquiera',
      description: 'El último elemento de la lista.',
      examples: [{ code: 'último([7, 8, 9])', result: '9' }],
    },
    (args, context) => {
      const list = expectList('último', args[0]!, context);
      if (list.items.length === 0)
        throw context.fail('LISTA_VACÍA', '`último` no puede tomar nada de una lista vacía.');
      return list.items[list.items.length - 1]!;
    },
  ),

  // diccionarios
  define(
    'claves',
    1,
    {
      level: 'intermedio',
      category: 'diccionarios',
      params: [{ name: 'd', type: 'diccionario' }],
      returns: 'lista',
      description: 'Una lista nueva con las claves del diccionario, en el orden en que se agregaron.',
      examples: [{ code: 'claves({ "a": 1, "b": 2 })', result: '["a", "b"]' }],
    },
    (args, context) => context.newList([...expectDict('claves', args[0]!, context).entries.keys()]),
  ),
  define(
    'valores',
    1,
    {
      level: 'intermedio',
      category: 'diccionarios',
      params: [{ name: 'd', type: 'diccionario' }],
      returns: 'lista',
      description: 'Una lista nueva con los valores del diccionario, en el orden de sus claves.',
      examples: [{ code: 'valores({ "a": 1, "b": 2 })', result: '[1, 2]' }],
    },
    (args, context) => context.newList([...expectDict('valores', args[0]!, context).entries.values()]),
  ),
  define(
    'tiene',
    2,
    {
      level: 'intermedio',
      category: 'diccionarios',
      params: [
        { name: 'd', type: 'diccionario' },
        { name: 'clave', type: 'texto | número' },
      ],
      returns: 'lógico',
      description: '`verdadero` si el diccionario tiene esa clave.',
      examples: [
        { code: 'tiene({ "a": 1 }, "a")', result: 'verdadero' },
        { code: 'tiene({ "a": 1 }, "b")', result: 'falso' },
      ],
    },
    (args, context) => expectDict('tiene', args[0]!, context).entries.has(expectKey('tiene', args[1]!, context)),
  ),

  // matemáticas
  define(
    'piso',
    1,
    {
      level: 'principiante',
      category: 'matemáticas',
      params: [{ name: 'x', type: 'número' }],
      returns: 'número',
      description: 'Redondea hacia abajo.',
      examples: [
        { code: 'piso(2.7)', result: '2' },
        { code: 'piso(-2.1)', result: '-3' },
      ],
    },
    (args, context) => Math.floor(expectNumber('piso', args[0]!, context)),
  ),
  define(
    'techo',
    1,
    {
      level: 'principiante',
      category: 'matemáticas',
      params: [{ name: 'x', type: 'número' }],
      returns: 'número',
      description: 'Redondea hacia arriba.',
      examples: [{ code: 'techo(2.1)', result: '3' }],
    },
    (args, context) => Math.ceil(expectNumber('techo', args[0]!, context)),
  ),
  define(
    'entero',
    1,
    {
      level: 'principiante',
      category: 'matemáticas',
      params: [{ name: 'x', type: 'número' }],
      returns: 'número',
      description: 'Quita los decimales, sin redondear.',
      examples: [{ code: 'entero(-2.7)', result: '-2' }],
    },
    (args, context) => Math.trunc(expectNumber('entero', args[0]!, context)),
  ),
  define(
    'raíz',
    1,
    {
      level: 'principiante',
      category: 'matemáticas',
      params: [{ name: 'x', type: 'número' }],
      returns: 'número',
      description: 'La raíz cuadrada. De un número negativo es un error.',
      examples: [{ code: 'raíz(16)', result: '4' }],
    },
    (args, context) => {
      const value = expectNumber('raíz', args[0]!, context);
      if (value < 0) {
        throw context.fail(
          'RAÍZ_DE_NEGATIVO',
          `\`raíz\` no tiene un resultado real para ${repr(value)}.`,
          'La raíz cuadrada solo existe para números de 0 en adelante. ¿Quisiste usar `absoluto(…)` antes?',
        );
      }
      return Math.sqrt(value);
    },
  ),
  define(
    'aleatorio',
    2,
    {
      level: 'principiante',
      category: 'matemáticas',
      params: [
        { name: 'mínimo', type: 'número' },
        { name: 'máximo', type: 'número' },
      ],
      returns: 'número',
      description:
        'Un entero al azar entre `mínimo` y `máximo`, los dos incluidos. Con la misma semilla da los mismos números.',
      examples: [{ code: 'variable dado = aleatorio(1, 6)\ndado >= 1 y dado <= 6', result: 'verdadero' }],
    },
    (args, context) => {
      const low = expectInteger('aleatorio', args[0]!, context, ' como mínimo');
      const high = expectInteger('aleatorio', args[1]!, context, ' como máximo');
      if (low > high) {
        throw context.fail(
          'TIPO_DE_ARGUMENTO',
          `\`aleatorio\` necesita que el mínimo (${low}) no sea mayor que el máximo (${high}).`,
        );
      }
      return low + Math.floor(context.random() * (high - low + 1));
    },
  ),

  // texto
  define(
    'mayúsculas',
    1,
    {
      level: 'intermedio',
      category: 'texto',
      params: [{ name: 't', type: 'texto' }],
      returns: 'texto',
      description: 'El mismo texto en mayúsculas.',
      examples: [{ code: 'mayúsculas("Ñandú")', result: '"ÑANDÚ"' }],
    },
    (args, context) => expectText('mayúsculas', args[0]!, context).toLocaleUpperCase('es'),
  ),
  define(
    'minúsculas',
    1,
    {
      level: 'intermedio',
      category: 'texto',
      params: [{ name: 't', type: 'texto' }],
      returns: 'texto',
      description: 'El mismo texto en minúsculas.',
      examples: [{ code: 'minúsculas("ÁRBOL")', result: '"árbol"' }],
    },
    (args, context) => expectText('minúsculas', args[0]!, context).toLocaleLowerCase('es'),
  ),
  define(
    'recortar',
    1,
    {
      level: 'intermedio',
      category: 'texto',
      params: [{ name: 't', type: 'texto' }],
      returns: 'texto',
      description: 'El texto sin espacios ni saltos de línea al principio y al final.',
      examples: [{ code: 'recortar("  hola  ")', result: '"hola"' }],
    },
    (args, context) => expectText('recortar', args[0]!, context).trim(),
  ),
  define(
    'dividir',
    2,
    {
      level: 'intermedio',
      category: 'texto',
      params: [
        { name: 't', type: 'texto' },
        { name: 'separador', type: 'texto' },
      ],
      returns: 'lista',
      description: 'Parte el texto en cada aparición del separador.',
      examples: [{ code: 'dividir("a,b,c", ",")', result: '["a", "b", "c"]' }],
    },
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
  ),
  define(
    'unir',
    2,
    {
      level: 'intermedio',
      category: 'texto',
      params: [
        { name: 'lista', type: 'lista' },
        { name: 'separador', type: 'texto' },
      ],
      returns: 'texto',
      description: 'Une los elementos de la lista en un texto, con el separador entre cada uno.',
      examples: [{ code: 'unir(["a", "b", "c"], "-")', result: '"a-b-c"' }],
    },
    (args, context) => {
      const list = expectList('unir', args[0]!, context);
      const separator = expectText('unir', args[1]!, context, ' como separador');
      return list.items.map(show).join(separator);
    },
  ),
  define(
    'reemplazar',
    3,
    {
      level: 'intermedio',
      category: 'texto',
      params: [
        { name: 't', type: 'texto' },
        { name: 'buscar', type: 'texto' },
        { name: 'poner', type: 'texto' },
      ],
      returns: 'texto',
      description: 'Cambia cada aparición de `buscar` por `poner`.',
      examples: [{ code: 'reemplazar("la casa", "a", "o")', result: '"lo coso"' }],
    },
    (args, context) => {
      const text = expectText('reemplazar', args[0]!, context);
      const search = expectText('reemplazar', args[1]!, context, ' para buscar');
      const replacement = expectText('reemplazar', args[2]!, context, ' para poner');
      if (search === '') {
        throw context.fail('SEPARADOR_VACÍO', '`reemplazar` necesita un texto que buscar que no esté vacío.');
      }
      return text.replaceAll(search, replacement);
    },
  ),
  define(
    'contiene',
    2,
    {
      level: 'intermedio',
      category: 'texto',
      params: [
        { name: 't', type: 'texto | lista' },
        { name: 'x', type: 'cualquiera' },
      ],
      returns: 'lógico',
      description: 'En un texto, si aparece la parte buscada; en una lista, si está el valor (comparando por valor).',
      examples: [
        { code: 'contiene("murciélago", "cié")', result: 'verdadero' },
        { code: 'contiene([1, 2], 3)', result: 'falso' },
      ],
    },
    (args, context) => {
      const container = args[0]!;
      if (isList(container)) return container.items.some(item => equals(item, args[1]!));
      return expectTextOrList('contiene', container, context).includes(
        expectText('contiene', args[1]!, context, ' para buscar'),
      );
    },
  ),
  define(
    'posición_de',
    2,
    {
      level: 'intermedio',
      category: 'texto',
      params: [
        { name: 't', type: 'texto | lista' },
        { name: 'x', type: 'cualquiera' },
      ],
      returns: 'número',
      description: 'Dónde aparece por primera vez la parte o el valor buscado, o `-1` si no está.',
      examples: [
        { code: 'posición_de("banana", "na")', result: '2' },
        { code: 'posición_de([5, 6], 7)', result: '-1' },
      ],
    },
    (args, context) => {
      const container = args[0]!;
      if (isList(container)) return container.items.findIndex(item => equals(item, args[1]!));
      return expectTextOrList('posición_de', container, context).indexOf(
        expectText('posición_de', args[1]!, context, ' para buscar'),
      );
    },
  ),
  define(
    'empieza_con',
    2,
    {
      level: 'intermedio',
      category: 'texto',
      params: [
        { name: 't', type: 'texto' },
        { name: 'inicio', type: 'texto' },
      ],
      returns: 'lógico',
      description: '`verdadero` si el texto empieza con `inicio`.',
      examples: [{ code: 'empieza_con("Codexivo", "Code")', result: 'verdadero' }],
    },
    (args, context) =>
      expectText('empieza_con', args[0]!, context).startsWith(
        expectText('empieza_con', args[1]!, context, ' como inicio'),
      ),
  ),
  define(
    'termina_con',
    2,
    {
      level: 'intermedio',
      category: 'texto',
      params: [
        { name: 't', type: 'texto' },
        { name: 'final', type: 'texto' },
      ],
      returns: 'lógico',
      description: '`verdadero` si el texto termina con `final`.',
      examples: [{ code: 'termina_con("Codexivo", "vo")', result: 'verdadero' }],
    },
    (args, context) =>
      expectText('termina_con', args[0]!, context).endsWith(
        expectText('termina_con', args[1]!, context, ' como final'),
      ),
  ),
  define(
    'subtexto',
    3,
    {
      level: 'intermedio',
      category: 'texto',
      params: [
        { name: 't', type: 'texto' },
        { name: 'inicio', type: 'número' },
        { name: 'fin', type: 'número' },
      ],
      returns: 'texto',
      description: 'Los caracteres desde `inicio` hasta antes de `fin`.',
      examples: [{ code: 'subtexto("hola", 1, 3)', result: '"ol"' }],
    },
    (args, context) => {
      const text = expectText('subtexto', args[0]!, context);
      const [start, end] = sliceBounds('subtexto', args, text.length, false, context);
      return text.slice(start, end);
    },
  ),
  define(
    'caracteres',
    1,
    {
      level: 'intermedio',
      category: 'texto',
      params: [{ name: 't', type: 'texto' }],
      returns: 'lista',
      description: 'Una lista con cada carácter del texto.',
      examples: [{ code: 'caracteres("año")', result: '["a", "ñ", "o"]' }],
    },
    (args, context) => context.newList([...expectText('caracteres', args[0]!, context)]),
  ),
  define(
    'código_de',
    1,
    {
      level: 'intermedio',
      category: 'texto',
      params: [{ name: 'c', type: 'texto' }],
      returns: 'número',
      description: 'El código Unicode de un carácter.',
      examples: [{ code: 'código_de("A")', result: '65' }],
    },
    (args, context) => {
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
    },
  ),
  define(
    'carácter_de',
    1,
    {
      level: 'intermedio',
      category: 'texto',
      params: [{ name: 'n', type: 'número' }],
      returns: 'texto',
      description: 'El carácter que tiene ese código Unicode.',
      examples: [{ code: 'carácter_de(241)', result: '"ñ"' }],
    },
    (args, context) => {
      const code = expectInteger('carácter_de', args[0]!, context);
      if (code < 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
        throw context.fail('TIPO_DE_ARGUMENTO', `${code} no es el código de ningún carácter.`);
      }
      return String.fromCodePoint(code);
    },
  ),

  // listas que cambian
  define(
    'insertar',
    3,
    {
      level: 'intermedio',
      category: 'listas',
      params: [
        { name: 'lista', type: 'lista' },
        { name: 'posición', type: 'número' },
        { name: 'x', type: 'cualquiera' },
      ],
      returns: 'nulo',
      mutates: true,
      description: 'Pone `x` en esa posición y recorre los demás elementos.',
      examples: [{ code: 'variable l = [1, 3]\ninsertar(l, 1, 2)\nl', result: '[1, 2, 3]' }],
    },
    (args, context) => {
      const list = expectList('insertar', args[0]!, context);
      const position = positionIn('insertar', args[1]!, list.items.length, true, context, true);
      list.items.splice(position, 0, args[2]!);
      return null;
    },
  ),
  define(
    'quitar_último',
    1,
    {
      level: 'intermedio',
      category: 'listas',
      params: [{ name: 'lista', type: 'lista' }],
      returns: 'cualquiera',
      mutates: true,
      description: 'Quita el último elemento y lo regresa.',
      examples: [{ code: 'variable l = [1, 2]\n[quitar_último(l), l]', result: '[2, [1]]' }],
    },
    (args, context) => {
      const list = expectList('quitar_último', args[0]!, context);
      if (list.items.length === 0) throw emptyListError('quitar_último', context);
      return list.items.pop()!;
    },
  ),
  define(
    'quitar_primero',
    1,
    {
      level: 'intermedio',
      category: 'listas',
      params: [{ name: 'lista', type: 'lista' }],
      returns: 'cualquiera',
      mutates: true,
      description: 'Quita el primer elemento y lo regresa.',
      examples: [{ code: 'variable l = [1, 2]\n[quitar_primero(l), l]', result: '[1, [2]]' }],
    },
    (args, context) => {
      const list = expectList('quitar_primero', args[0]!, context);
      if (list.items.length === 0) throw emptyListError('quitar_primero', context);
      return list.items.shift()!;
    },
  ),
  define(
    'vaciar',
    1,
    {
      level: 'intermedio',
      category: 'listas',
      params: [{ name: 'lista', type: 'lista | diccionario' }],
      returns: 'nulo',
      mutates: true,
      description: 'Quita todos los elementos de una lista (o todas las claves de un diccionario).',
      examples: [{ code: 'variable l = [1, 2]\nvaciar(l)\nl', result: '[]' }],
    },
    (args, context) => {
      const container = args[0]!;
      if (isDict(container)) container.entries.clear();
      else expectList('vaciar', container, context).items.length = 0;
      return null;
    },
  ),

  // listas nuevas
  define(
    'rebanar',
    3,
    {
      level: 'intermedio',
      category: 'listas',
      params: [
        { name: 'lista', type: 'lista' },
        { name: 'inicio', type: 'número' },
        { name: 'fin', type: 'número' },
      ],
      returns: 'lista',
      description: 'Una lista nueva con los elementos desde `inicio` hasta antes de `fin`.',
      examples: [{ code: 'rebanar([1, 2, 3, 4], 1, 3)', result: '[2, 3]' }],
    },
    (args, context) => {
      const list = expectList('rebanar', args[0]!, context);
      const [start, end] = sliceBounds('rebanar', args, list.items.length, true, context);
      return context.newList(list.items.slice(start, end));
    },
  ),
  define(
    'invertir',
    1,
    {
      level: 'intermedio',
      category: 'listas',
      params: [{ name: 'lista', type: 'lista | texto' }],
      returns: 'lista | texto',
      description: 'Una lista (o un texto) nueva al revés.',
      examples: [
        { code: 'invertir([1, 2, 3])', result: '[3, 2, 1]' },
        { code: 'invertir("hola")', result: '"aloh"' },
      ],
    },
    (args, context) => {
      const value = args[0]!;
      if (typeof value === 'string') return [...value].reverse().join('');
      if (isList(value)) return context.newList([...value.items].reverse());
      throw context.fail(
        'TIPO_DE_ARGUMENTO',
        `\`invertir\` espera una lista o un texto, pero recibió ${describeType(typeOf(value))}.`,
      );
    },
  ),
  define(
    'copiar',
    1,
    {
      level: 'intermedio',
      category: 'listas',
      params: [{ name: 'lista', type: 'lista | diccionario' }],
      returns: 'lista | diccionario',
      description:
        'Una lista o diccionario nuevo con los mismos elementos. Los elementos que son listas se siguen compartiendo.',
      examples: [{ code: 'variable a = [1]\nvariable b = copiar(a)\nagregar(b, 2)\n[a, b]', result: '[[1], [1, 2]]' }],
    },
    (args, context) => {
      const value = args[0]!;
      if (isDict(value)) return context.newDict(new Map(value.entries));
      return context.newList([...expectList('copiar', value, context).items]);
    },
  ),
  define(
    'sumar',
    1,
    {
      level: 'intermedio',
      category: 'listas',
      params: [{ name: 'lista', type: 'lista' }],
      returns: 'número',
      description: 'La suma de los números de la lista.',
      examples: [{ code: 'sumar([1, 2, 3.5])', result: '6.5' }],
    },
    (args, context) =>
      expectList('sumar', args[0]!, context).items.reduce<number>(
        (total, item) => total + expectNumber('sumar', item, context, ' en cada elemento'),
        0,
      ),
  ),
  define(
    'lista_de',
    2,
    {
      level: 'intermedio',
      category: 'listas',
      params: [
        { name: 'n', type: 'número' },
        { name: 'valor', type: 'cualquiera' },
      ],
      returns: 'lista',
      description: 'Una lista con `n` copias de `valor`. Si el valor es una lista, cada casilla tiene su propia copia.',
      examples: [{ code: 'lista_de(3, 0)', result: '[0, 0, 0]' }],
    },
    (args, context) => {
      const count = expectCount('lista_de', args[0]!, context, ' como cantidad');
      return context.newList(Array.from({ length: count }, () => deepCopy(args[1]!, context)));
    },
  ),
  define(
    'matriz',
    3,
    {
      level: 'intermedio',
      category: 'listas',
      params: [
        { name: 'filas', type: 'número' },
        { name: 'columnas', type: 'número' },
        { name: 'valor', type: 'cualquiera' },
      ],
      returns: 'lista',
      description: 'Una lista de filas, cada una con `columnas` copias de `valor`.',
      examples: [{ code: 'matriz(2, 3, 0)', result: '[[0, 0, 0], [0, 0, 0]]' }],
    },
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
  ),

  // pilas y colas: listas con su propio vocabulario
  define(
    'apilar',
    2,
    {
      level: 'avanzado',
      category: 'estructuras',
      params: [
        { name: 'pila', type: 'lista' },
        { name: 'x', type: 'cualquiera' },
      ],
      returns: 'nulo',
      mutates: true,
      description: 'Pone `x` encima de la pila.',
      examples: [{ code: 'variable p = []\napilar(p, 1)\napilar(p, 2)\np', result: '[1, 2]' }],
    },
    (args, context) => {
      expectStructure('apilar', 'pila', args[0]!, context).items.push(args[1]!);
      return null;
    },
  ),
  define(
    'desapilar',
    1,
    {
      level: 'avanzado',
      category: 'estructuras',
      params: [{ name: 'pila', type: 'lista' }],
      returns: 'cualquiera',
      mutates: true,
      description: 'Quita el elemento de encima de la pila y lo regresa.',
      examples: [{ code: 'variable p = [1, 2]\n[desapilar(p), p]', result: '[2, [1]]' }],
    },
    (args, context) => {
      const stack = expectStructure('desapilar', 'pila', args[0]!, context);
      if (stack.items.length === 0) throw emptyStructure('desapilar', 'pila', context);
      return stack.items.pop()!;
    },
  ),
  define(
    'tope',
    1,
    {
      level: 'avanzado',
      category: 'estructuras',
      params: [{ name: 'pila', type: 'lista' }],
      returns: 'cualquiera',
      description: 'El elemento de encima de la pila, sin quitarlo.',
      examples: [{ code: 'tope([1, 2])', result: '2' }],
    },
    (args, context) => {
      const stack = expectStructure('tope', 'pila', args[0]!, context);
      if (stack.items.length === 0) throw emptyStructure('tope', 'pila', context);
      return stack.items[stack.items.length - 1]!;
    },
  ),
  define(
    'encolar',
    2,
    {
      level: 'avanzado',
      category: 'estructuras',
      params: [
        { name: 'cola', type: 'lista' },
        { name: 'x', type: 'cualquiera' },
      ],
      returns: 'nulo',
      mutates: true,
      description: 'Pone `x` al final de la cola.',
      examples: [{ code: 'variable c = []\nencolar(c, 1)\nencolar(c, 2)\nc', result: '[1, 2]' }],
    },
    (args, context) => {
      expectStructure('encolar', 'cola', args[0]!, context).items.push(args[1]!);
      return null;
    },
  ),
  define(
    'desencolar',
    1,
    {
      level: 'avanzado',
      category: 'estructuras',
      params: [{ name: 'cola', type: 'lista' }],
      returns: 'cualquiera',
      mutates: true,
      description: 'Quita el primer elemento de la cola y lo regresa.',
      examples: [{ code: 'variable c = [1, 2]\n[desencolar(c), c]', result: '[1, [2]]' }],
    },
    (args, context) => {
      const queue = expectStructure('desencolar', 'cola', args[0]!, context);
      if (queue.items.length === 0) throw emptyStructure('desencolar', 'cola', context);
      return queue.items.shift()!;
    },
  ),
  define(
    'frente',
    1,
    {
      level: 'avanzado',
      category: 'estructuras',
      params: [{ name: 'cola', type: 'lista' }],
      returns: 'cualquiera',
      description: 'El primer elemento de la cola, sin quitarlo.',
      examples: [{ code: 'frente([1, 2])', result: '1' }],
    },
    (args, context) => {
      const queue = expectStructure('frente', 'cola', args[0]!, context);
      if (queue.items.length === 0) throw emptyStructure('frente', 'cola', context);
      return queue.items[0]!;
    },
  ),
];

/** Constantes de la biblioteca. Una variable del usuario con el mismo nombre las oculta. */
export const constants: Readonly<Record<string, Value>> = {
  PI: Math.PI,
};

/** Documentación de cada constante, para el catálogo. */
export const constantDocs: Readonly<Record<string, { level: 'principiante'; description: string }>> = {
  PI: { level: 'principiante', description: 'La razón entre el perímetro de un círculo y su diámetro: 3.14159…' },
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

/**
 * Nativos que solo puede usar la biblioteca escrita en Codexivo (`prelude.ts`): validan argumentos con los
 * mismos mensajes que el resto de la biblioteca y ordenan sin comparador.
 */
export const internals: Record<string, NativeValue> = Object.fromEntries(
  [
    internal('revisar_lista', 2, (args, context) => {
      expectList(args[0] as string, args[1]!, context);
      return null;
    }),
    internal('revisar_procedimiento', 2, (args, context) => {
      const value = args[1]!;
      if (isCallable(value)) return null;
      throw context.fail(
        'TIPO_DE_ARGUMENTO',
        `\`${args[0] as string}\` espera un procedimiento, pero recibió ${describeType(typeOf(value))} (${repr(value)}).`,
        'Pasa el nombre del procedimiento sin paréntesis (`mapear(lista, doble)`), o escribe uno: `procedimiento(x) { regresa x * 2 }`.',
      );
    }),
    internal('revisar_logico', 2, (args, context) => {
      const value = args[1]!;
      if (typeof value === 'boolean') return value;
      throw context.fail(
        'TIPO_DE_ARGUMENTO',
        `El procedimiento que recibió \`${args[0] as string}\` tiene que regresar \`verdadero\` o \`falso\`, pero regresó ${repr(value)}.`,
        args[0] === 'ordenar'
          ? 'El comparador de `ordenar(lista, va_antes)` responde «¿va `a` antes que `b`?»: `procedimiento(a, b) { regresa a < b }`.'
          : '¿Le falta un `regresa` con una comparación, como `regresa x > 0`?',
      );
    }),
    internal('ordenar_natural', 1, (args, context) => {
      const list = expectList('ordenar', args[0]!, context);
      const kind = sortableKind(list, context);
      // `sort` de JavaScript es estable; los textos se comparan carácter por carácter, igual que `<`.
      const items = [...list.items].sort((a, b) =>
        kind === 'número' ? (a as number) - (b as number) : a! < b! ? -1 : a! > b! ? 1 : 0,
      );
      return context.newList(items);
    }),
  ].map(native => [native.name, native]),
);
