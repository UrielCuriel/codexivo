import type { NativeContext, NativeValue } from './runtime/values';

/**
 * Modo mundo: el mismo lenguaje con procedimientos para mover un robot en una cuadrícula, como Karel.
 * Este módulo define el formato del mundo, sus reglas y sus eventos; el sitio solo lo dibuja.
 *
 * Coordenadas: `x` crece hacia el este y `y` hacia el norte; la casilla de la esquina suroeste es (1, 1).
 */

export type Direction = 'norte' | 'este' | 'sur' | 'oeste';

/** Una cantidad de zumbadores: un entero ≥ 0 o `'infinito'` (JSON no tiene `Infinity`). */
export type BeeperCount = number | 'infinito';

/** Pared en el lado `side` de la casilla (x, y). La misma pared es el lado opuesto de la casilla vecina. */
export interface Wall {
  x: number;
  y: number;
  side: Direction;
}

export interface BeeperPile {
  x: number;
  y: number;
  count: BeeperCount;
}

export interface Robot {
  x: number;
  y: number;
  facing: Direction;
  /** Zumbadores en la mochila. */
  beepers: BeeperCount;
}

/** Formato de un mundo, versión 1. Es el que guardan el editor de mundos y los retos del sitio. */
export interface WorldDefinition {
  version: 1;
  /** Casillas de oeste a este. */
  width: number;
  /** Casillas de sur a norte. */
  height: number;
  walls?: Wall[];
  beepers?: BeeperPile[];
  robot: Robot;
}

/**
 * Estado de un mundo en un momento dado. Tiene el mismo formato que `WorldDefinition` (se puede usar como
 * mundo inicial de otra ejecución), más si el robot sigue encendido. Las paredes salen normalizadas: solo
 * lados `norte` y `este`, sin repetir, y sin los bordes de la cuadrícula.
 */
export interface WorldState extends Required<WorldDefinition> {
  robot: Robot & { on: boolean };
}

export interface WorldValidationError {
  /** Dónde está el problema, como `robot.x` o `walls[2].side`. */
  path: string;
  message: string;
}

export const DIRECTIONS: readonly Direction[] = ['norte', 'este', 'sur', 'oeste'];

const MAX_SIZE = 100;

// ── validación ───────────────────────────────────────────────────────────────

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Revisa que `input` (por ejemplo, el resultado de `JSON.parse`) sea un mundo válido. Nunca lanza: regresa el
 * mundo o la lista de problemas, con mensajes para quien edita el mundo.
 */
export const validateWorld = (
  input: unknown,
): { world: WorldDefinition; errors: [] } | { world?: undefined; errors: WorldValidationError[] } => {
  const errors: WorldValidationError[] = [];
  const fail = (path: string, message: string) => errors.push({ path, message });

  if (!isObject(input)) {
    fail('', 'El mundo tiene que ser un objeto JSON.');
    return { errors };
  }
  if (input.version !== 1) {
    fail('version', `La versión del formato tiene que ser 1, pero es ${JSON.stringify(input.version)}.`);
  }

  const size = (key: 'width' | 'height', what: string): number => {
    const value = input[key];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > MAX_SIZE) {
      fail(
        key,
        `\`${key}\` (${what}) tiene que ser un entero entre 1 y ${MAX_SIZE}, pero es ${JSON.stringify(value)}.`,
      );
      return 0;
    }
    return value;
  };
  const width = size('width', 'casillas de oeste a este');
  const height = size('height', 'casillas de sur a norte');

  const position = (value: Record<string, unknown>, path: string) => {
    for (const [axis, limit] of [
      ['x', width],
      ['y', height],
    ] as const) {
      const coordinate = value[axis];
      if (typeof coordinate !== 'number' || !Number.isInteger(coordinate)) {
        fail(
          `${path}.${axis}`,
          `\`${path}.${axis}\` tiene que ser un número entero, pero es ${JSON.stringify(coordinate)}.`,
        );
      } else if (limit > 0 && (coordinate < 1 || coordinate > limit)) {
        fail(`${path}.${axis}`, `\`${path}.${axis}\` tiene que estar entre 1 y ${limit}, pero es ${coordinate}.`);
      }
    }
  };
  const direction = (value: unknown, path: string) => {
    if (!DIRECTIONS.includes(value as Direction)) {
      fail(path, `\`${path}\` tiene que ser "norte", "este", "sur" u "oeste", pero es ${JSON.stringify(value)}.`);
    }
  };
  const count = (value: unknown, path: string) => {
    if (value === 'infinito') return;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      fail(
        path,
        `\`${path}\` tiene que ser un entero de 0 en adelante o "infinito", pero es ${JSON.stringify(value)}.`,
      );
    }
  };
  const list = (key: 'walls' | 'beepers', check: (item: Record<string, unknown>, path: string) => void) => {
    const value = input[key];
    if (value === undefined) return;
    if (!Array.isArray(value)) {
      fail(key, `\`${key}\` tiene que ser una lista.`);
      return;
    }
    value.forEach((item, index) => {
      const path = `${key}[${index}]`;
      if (!isObject(item)) fail(path, `\`${path}\` tiene que ser un objeto.`);
      else check(item, path);
    });
  };

  list('walls', (wall, path) => {
    position(wall, path);
    direction(wall.side, `${path}.side`);
  });
  const piles = new Set<string>();
  list('beepers', (pile, path) => {
    position(pile, path);
    count(pile.count, `${path}.count`);
    const key = `${pile.x},${pile.y}`;
    if (piles.has(key)) fail(path, `La casilla (${pile.x}, ${pile.y}) aparece dos veces en \`beepers\`.`);
    piles.add(key);
  });

  if (!isObject(input.robot)) {
    fail('robot', 'Falta `robot`, con su posición, orientación y zumbadores.');
  } else {
    position(input.robot, 'robot');
    direction(input.robot.facing, 'robot.facing');
    count(input.robot.beepers, 'robot.beepers');
  }

  if (errors.length > 0) return { errors };
  return { world: input as unknown as WorldDefinition, errors: [] };
};

// ── mundo en ejecución ───────────────────────────────────────────────────────

const LEFT: Record<Direction, Direction> = { norte: 'oeste', oeste: 'sur', sur: 'este', este: 'norte' };
const RIGHT: Record<Direction, Direction> = { norte: 'este', este: 'sur', sur: 'oeste', oeste: 'norte' };
const STEP: Record<Direction, [number, number]> = { norte: [0, 1], este: [1, 0], sur: [0, -1], oeste: [-1, 0] };

const toNumber = (count: BeeperCount): number => (count === 'infinito' ? Infinity : count);
const toCount = (value: number): BeeperCount => (value === Infinity ? 'infinito' : value);

/** Lo que el evento `robot` dice del robot antes y después de una acción. */
export interface RobotSnapshot {
  x: number;
  y: number;
  facing: Direction;
  beepers: BeeperCount;
  on: boolean;
}

export type RobotAction = 'avanzar' | 'girar_izquierda' | 'recoger_zumbador' | 'dejar_zumbador' | 'apagar';

/** Evento `robot`: uno por acción, para que el sitio anime sin recalcular nada. */
export interface RobotEvent {
  type: 'robot';
  action: RobotAction;
  before: RobotSnapshot;
  after: RobotSnapshot;
  /** Zumbadores que quedaron en la casilla, en `recoger_zumbador` y `dejar_zumbador`. */
  cell?: { x: number; y: number; beepers: BeeperCount };
}

export interface World {
  /** Procedimientos del modo mundo; se pasan a la máquina (lo hace `MachineOptions.world`). */
  natives: Record<string, NativeValue>;
  /** Estado actual del mundo, serializable. */
  state(): WorldState;
}

/**
 * Crea un mundo listo para una ejecución. Lanza un `Error` si la definición no es válida; usa `validateWorld`
 * antes para mostrar los problemas a quien editó el mundo.
 */
export const createWorld = (definition: WorldDefinition): World => {
  const { world, errors } = validateWorld(definition);
  if (!world) throw new Error(`El mundo no es válido: ${errors.map(error => error.message).join(' ')}`);

  const { width, height } = world;
  const walls = new Set<string>();
  const wallKey = (x: number, y: number, side: Direction): string => {
    // Cada pared se guarda como el lado norte o este de una casilla.
    if (side === 'sur') return `n:${x}:${y - 1}`;
    if (side === 'oeste') return `e:${x - 1}:${y}`;
    return `${side === 'norte' ? 'n' : 'e'}:${x}:${y}`;
  };
  for (const wall of world.walls ?? []) walls.add(wallKey(wall.x, wall.y, wall.side));

  const beepers = new Map<string, number>();
  for (const pile of world.beepers ?? []) {
    if (toNumber(pile.count) > 0) beepers.set(`${pile.x},${pile.y}`, toNumber(pile.count));
  }

  const robot = { ...world.robot, beepers: toNumber(world.robot.beepers), on: true };

  const isOpen = (x: number, y: number, side: Direction): boolean => {
    const [dx, dy] = STEP[side];
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 1 || ny < 1 || nx > width || ny > height) return false;
    return !walls.has(wallKey(x, y, side));
  };

  const snapshotRobot = (): RobotSnapshot => ({
    x: robot.x,
    y: robot.y,
    facing: robot.facing,
    beepers: toCount(robot.beepers),
    on: robot.on,
  });
  const where = () => `El robot está en (${robot.x}, ${robot.y}) mirando al ${robot.facing}.`;

  const action = (name: RobotAction, run: (context: NativeContext) => RobotEvent['cell'] | void): NativeValue => ({
    kind: 'nativo',
    name,
    arity: 0,
    call: (_args, context) => {
      if (!robot.on) {
        throw context.fail(
          'ROBOT_APAGADO',
          `El robot ya está apagado; no puede \`${name}\`.`,
          '`apagar()` va al final: después de apagarlo, el robot ya no hace nada.',
        );
      }
      const before = snapshotRobot();
      const cell = run(context);
      context.emit({ type: 'robot', action: name, before, after: snapshotRobot(), ...(cell ? { cell } : {}) });
      return null;
    },
  });
  const question = (name: string, answer: () => boolean): NativeValue => ({
    kind: 'nativo',
    name,
    arity: 0,
    call: answer,
  });

  const actions: NativeValue[] = [
    action('avanzar', context => {
      if (!isOpen(robot.x, robot.y, robot.facing)) {
        const [dx, dy] = STEP[robot.facing];
        const edge = robot.x + dx < 1 || robot.y + dy < 1 || robot.x + dx > width || robot.y + dy > height;
        throw context.fail(
          'CHOQUE_CON_PARED',
          `El robot chocó con ${edge ? 'el borde del mundo' : 'una pared'}. ${where()}`,
          'Pregunta antes con `frente_libre()`.',
        );
      }
      const [dx, dy] = STEP[robot.facing];
      robot.x += dx;
      robot.y += dy;
    }),
    action('girar_izquierda', () => {
      robot.facing = LEFT[robot.facing];
    }),
    action('recoger_zumbador', context => {
      const key = `${robot.x},${robot.y}`;
      const here = beepers.get(key) ?? 0;
      if (here === 0) {
        throw context.fail(
          'SIN_ZUMBADORES',
          `No hay zumbadores que recoger. ${where()}`,
          'Pregunta antes con `hay_zumbador()`.',
        );
      }
      if (here !== Infinity) {
        if (here === 1) beepers.delete(key);
        else beepers.set(key, here - 1);
      }
      if (robot.beepers !== Infinity) robot.beepers += 1;
      return { x: robot.x, y: robot.y, beepers: toCount(beepers.get(key) ?? 0) };
    }),
    action('dejar_zumbador', context => {
      if (robot.beepers === 0) {
        throw context.fail(
          'MOCHILA_VACÍA',
          `El robot no tiene zumbadores que dejar. ${where()}`,
          'Pregunta antes con `tengo_zumbadores()`.',
        );
      }
      if (robot.beepers !== Infinity) robot.beepers -= 1;
      const key = `${robot.x},${robot.y}`;
      const here = beepers.get(key) ?? 0;
      if (here !== Infinity) beepers.set(key, here + 1);
      return { x: robot.x, y: robot.y, beepers: toCount(beepers.get(key)!) };
    }),
    action('apagar', () => {
      robot.on = false;
    }),
    question('frente_libre', () => isOpen(robot.x, robot.y, robot.facing)),
    question('izquierda_libre', () => isOpen(robot.x, robot.y, LEFT[robot.facing])),
    question('derecha_libre', () => isOpen(robot.x, robot.y, RIGHT[robot.facing])),
    question('hay_zumbador', () => (beepers.get(`${robot.x},${robot.y}`) ?? 0) > 0),
    question('tengo_zumbadores', () => robot.beepers > 0),
    ...DIRECTIONS.map(direction => question(`mirando_al_${direction}`, () => robot.facing === direction)),
  ];

  const state = (): WorldState => {
    const normalized: Wall[] = [...walls]
      .map(key => {
        const [kind, x, y] = key.split(':');
        return { x: Number(x), y: Number(y), side: kind === 'n' ? ('norte' as const) : ('este' as const) };
      })
      .filter(wall =>
        wall.side === 'norte'
          ? wall.y >= 1 && wall.y < height && wall.x >= 1
          : wall.x >= 1 && wall.x < width && wall.y >= 1,
      )
      .sort((a, b) => a.y - b.y || a.x - b.x || a.side.localeCompare(b.side));
    const piles: BeeperPile[] = [...beepers]
      .map(([key, count]) => {
        const [x, y] = key.split(',').map(Number) as [number, number];
        return { x, y, count: toCount(count) };
      })
      .sort((a, b) => a.y - b.y || a.x - b.x);
    return {
      version: 1,
      width,
      height,
      walls: normalized,
      beepers: piles,
      robot: { x: robot.x, y: robot.y, facing: robot.facing, beepers: toCount(robot.beepers), on: robot.on },
    };
  };

  return { natives: Object.fromEntries(actions.map(native => [native.name, native])), state };
};

// ── objetivos de un reto ─────────────────────────────────────────────────────

/**
 * Lo que tiene que cumplir el mundo al terminar. Lo que no se indica, no se revisa: así un reto puede pedir
 * solo «termina en (5, 1)» o solo «recoge todos los zumbadores».
 */
export interface WorldGoal {
  robot?: Partial<Robot & { on: boolean }>;
  /** Zumbadores esperados en esas casillas (`0` para «vacía»). */
  beepers?: BeeperPile[];
  /** Con `true`, las casillas que no están en `beepers` tienen que quedar vacías. */
  onlyListedBeepers?: boolean;
}

export interface GoalDifference {
  /** Qué se revisó, como `robot.x` o `beepers(3, 1)`. */
  field: string;
  expected: unknown;
  actual: unknown;
  message: string;
}

/** Compara el mundo final con un objetivo. Es una función pura. */
export const checkGoal = (state: WorldState, goal: WorldGoal): { ok: boolean; differences: GoalDifference[] } => {
  const differences: GoalDifference[] = [];
  const robotLabels: Record<keyof WorldState['robot'], string> = {
    x: 'la columna (x)',
    y: 'la fila (y)',
    facing: 'la orientación',
    beepers: 'los zumbadores en la mochila',
    on: 'si está encendido',
  };
  for (const [field, expected] of Object.entries(goal.robot ?? {}) as Array<[keyof WorldState['robot'], unknown]>) {
    if (expected === undefined) continue;
    const actual = state.robot[field];
    if (actual !== expected) {
      differences.push({
        field: `robot.${field}`,
        expected,
        actual,
        message:
          field === 'on'
            ? expected
              ? 'El robot tenía que quedar encendido.'
              : 'El robot tenía que terminar apagado: falta `apagar()`.'
            : `En ${robotLabels[field]} se esperaba ${JSON.stringify(expected)}, pero quedó ${JSON.stringify(actual)}.`,
      });
    }
  }

  const actualPiles = new Map(state.beepers.map(pile => [`${pile.x},${pile.y}`, pile.count]));
  const listed = new Set<string>();
  for (const pile of goal.beepers ?? []) {
    const key = `${pile.x},${pile.y}`;
    listed.add(key);
    const actual = actualPiles.get(key) ?? 0;
    if (actual !== pile.count) {
      differences.push({
        field: `beepers(${pile.x}, ${pile.y})`,
        expected: pile.count,
        actual,
        message: `En la casilla (${pile.x}, ${pile.y}) se esperaban ${pile.count} zumbadores, pero hay ${actual}.`,
      });
    }
  }
  if (goal.onlyListedBeepers) {
    for (const [key, count] of actualPiles) {
      if (listed.has(key)) continue;
      const [x, y] = key.split(',');
      differences.push({
        field: `beepers(${x}, ${y})`,
        expected: 0,
        actual: count,
        message: `La casilla (${x}, ${y}) tenía que quedar vacía, pero tiene ${count} zumbadores.`,
      });
    }
  }
  return { ok: differences.length === 0, differences };
};
