import { describe, expect, test } from 'bun:test';
import { checkGoal, createWorld, prepare, run, validateWorld } from '../src';
import type { MachineEvent, RobotEvent, WorldDefinition } from '../src';

const row = (overrides: Partial<WorldDefinition> = {}): WorldDefinition => ({
  version: 1,
  width: 5,
  height: 1,
  beepers: [
    { x: 2, y: 1, count: 1 },
    { x: 4, y: 1, count: 3 },
  ],
  robot: { x: 1, y: 1, facing: 'este', beepers: 0 },
  ...overrides,
});

const inWorld = (source: string, definition: WorldDefinition = row()) => {
  const world = createWorld(definition);
  return run(source, { world, trace: true });
};

const robotEvents = (events: MachineEvent[] = []) =>
  events.filter((event): event is RobotEvent & MachineEvent => event.type === 'robot');

describe('modelo del mundo', () => {
  test('un mundo válido no tiene errores', () => {
    expect(validateWorld(row()).errors).toEqual([]);
  });

  test.each([
    [{ version: 2 }, 'version'],
    [{ width: 0 }, 'width'],
    [{ height: 1.5 }, 'height'],
    [{ walls: [{ x: 9, y: 1, side: 'norte' }] }, 'walls[0].x'],
    [{ walls: [{ x: 1, y: 1, side: 'arriba' }] }, 'walls[0].side'],
    [{ walls: 'no' }, 'walls'],
    [{ beepers: [{ x: 1, y: 1, count: -1 }] }, 'beepers[0].count'],
    [
      {
        beepers: [
          { x: 1, y: 1, count: 1 },
          { x: 1, y: 1, count: 2 },
        ],
      },
      'beepers[1]',
    ],
    [{ robot: { x: 1, y: 1, facing: 'este', beepers: 'muchos' } }, 'robot.beepers'],
    [{ robot: { x: 1, y: 7, facing: 'este', beepers: 0 } }, 'robot.y'],
    [{ robot: undefined }, 'robot'],
  ])('%j → error en %s', (overrides, path) => {
    const { errors } = validateWorld({ ...row(), ...overrides });
    expect(errors.map(error => error.path)).toContain(path);
    expect(errors.find(error => error.path === path)!.message.length).toBeGreaterThan(10);
  });

  test('no es un objeto', () => {
    expect(validateWorld('hola').errors[0]!.message).toContain('objeto');
  });

  test('createWorld lanza con un mundo inválido', () => {
    expect(() => createWorld({ ...row(), width: 0 })).toThrow('no es válido');
  });

  test('el estado tiene el mismo formato que el mundo, con las paredes normalizadas', () => {
    const world = createWorld({
      version: 1,
      width: 3,
      height: 3,
      walls: [
        { x: 2, y: 2, side: 'sur' },
        { x: 2, y: 1, side: 'norte' },
        { x: 3, y: 2, side: 'oeste' },
        { x: 3, y: 3, side: 'este' },
      ],
      beepers: [{ x: 1, y: 1, count: 'infinito' }],
      robot: { x: 1, y: 1, facing: 'norte', beepers: 'infinito' },
    });
    const state = world.state();
    // las dos primeras son la misma pared; la última es el borde
    expect(state.walls).toEqual([
      { x: 2, y: 1, side: 'norte' },
      { x: 2, y: 2, side: 'este' },
    ]);
    expect(state.beepers).toEqual([{ x: 1, y: 1, count: 'infinito' }]);
    expect(state.robot).toEqual({ x: 1, y: 1, facing: 'norte', beepers: 'infinito', on: true });
    expect(validateWorld(state).errors).toEqual([]);
  });
});

describe('procedimientos del mundo', () => {
  test('solo existen cuando se pasa un mundo', () => {
    expect(run('avanzar();').errors[0]!.code).toBe('NOMBRE_DESCONOCIDO');
  });

  test('avanzar y girar', () => {
    const result = inWorld('avanzar(); girar_izquierda(); [mirando_al_norte(), mirando_al_este()];', {
      ...row(),
      height: 2,
    });
    expect(result.resultText).toBe('[verdadero, falso]');
    expect(result.world!.robot).toMatchObject({ x: 2, y: 1, facing: 'norte' });
  });

  test('girar cuatro veces deja al robot como estaba', () => {
    const result = inWorld('repetir 4 veces { girar_izquierda(); }');
    expect(result.world!.robot.facing).toBe('este');
  });

  test('recoger y dejar zumbadores', () => {
    const result = inWorld('avanzar(); recoger_zumbador(); avanzar(); dejar_zumbador(); tengo_zumbadores();');
    expect(result.resultText).toBe('falso');
    expect(result.world!.beepers).toEqual([
      { x: 3, y: 1, count: 1 },
      { x: 4, y: 1, count: 3 },
    ]);
  });

  test('los zumbadores infinitos no se acaban', () => {
    const result = inWorld('repetir 5 veces { recoger_zumbador(); } repetir 9 veces { dejar_zumbador(); }', {
      ...row(),
      beepers: [{ x: 1, y: 1, count: 'infinito' }],
      robot: { x: 1, y: 1, facing: 'este', beepers: 'infinito' },
    });
    expect(result.ok).toBe(true);
    expect(result.world!.beepers).toEqual([{ x: 1, y: 1, count: 'infinito' }]);
    expect(result.world!.robot.beepers).toBe('infinito');
  });

  test.each([
    ['frente_libre()', 'verdadero'],
    ['izquierda_libre()', 'falso'],
    ['derecha_libre()', 'falso'],
    ['hay_zumbador()', 'falso'],
    ['tengo_zumbadores()', 'falso'],
    ['mirando_al_este()', 'verdadero'],
    ['mirando_al_oeste()', 'falso'],
    ['mirando_al_sur()', 'falso'],
  ])('%s → %s', (source, expected) => {
    expect(inWorld(source).resultText).toBe(expected);
  });

  test('las paredes cierran el paso desde los dos lados', () => {
    const world = { ...row(), walls: [{ x: 2, y: 1, side: 'este' as const }] };
    expect(inWorld('avanzar(); frente_libre();', world).resultText).toBe('falso');
    expect(
      inWorld('frente_libre();', { ...world, robot: { x: 3, y: 1, facing: 'oeste', beepers: 0 } }).resultText,
    ).toBe('falso');
  });

  test('apagar', () => {
    const result = inWorld('apagar(); frente_libre();');
    expect(result.ok).toBe(true);
    expect(result.world!.robot.on).toBe(false);
  });
});

describe('errores del mundo', () => {
  test.each([
    ['girar_izquierda(); avanzar();', 'CHOQUE_CON_PARED', 'el borde del mundo', 'frente_libre'],
    ['recoger_zumbador();', 'SIN_ZUMBADORES', 'No hay zumbadores', 'hay_zumbador'],
    ['dejar_zumbador();', 'MOCHILA_VACÍA', 'no tiene zumbadores', 'tengo_zumbadores'],
    ['apagar(); avanzar();', 'ROBOT_APAGADO', 'ya está apagado', 'apagar'],
  ])('%s → %s', (source, code, message, hint) => {
    const error = inWorld(source).errors[0]!;
    expect(error.kind).toBe('ejecución');
    expect(error.code).toBe(code);
    expect(error.message).toContain(message);
    expect(error.hint).toContain(hint);
  });

  test('dicen dónde está y hacia dónde mira el robot', () => {
    const error = inWorld('avanzar();\navanzar();', { ...row(), walls: [{ x: 2, y: 1, side: 'este' }] }).errors[0]!;
    expect(error.message).toBe('El robot chocó con una pared. El robot está en (2, 1) mirando al este.');
    expect(error.span?.start.line).toBe(2);
  });
});

describe('eventos y fotografías', () => {
  test('cada acción emite un evento `robot` con el antes y el después', () => {
    const events = robotEvents(inWorld('avanzar(); recoger_zumbador(); girar_izquierda(); apagar();').events);
    expect(events.map(event => event.action)).toEqual(['avanzar', 'recoger_zumbador', 'girar_izquierda', 'apagar']);
    expect(events[0]).toMatchObject({
      before: { x: 1, y: 1, facing: 'este', beepers: 0, on: true },
      after: { x: 2, y: 1, facing: 'este', beepers: 0, on: true },
    });
    expect(events[1]).toMatchObject({ after: { beepers: 1 }, cell: { x: 2, y: 1, beepers: 0 } });
    expect(events[2]!.after.facing).toBe('norte');
    expect(events[3]!.after.on).toBe(false);
    expect(typeof events[0]!.nodeId).toBe('number');
  });

  test('las preguntas no emiten eventos', () => {
    expect(robotEvents(inWorld('frente_libre(); hay_zumbador();').events)).toEqual([]);
  });

  test('snapshot() incluye el estado del mundo', () => {
    const world = createWorld(row());
    const { machine } = prepare('avanzar();\nrecoger_zumbador();', { world, breakpoints: [2] });
    machine!.run();
    expect(machine!.snapshot().world!.robot).toMatchObject({ x: 2, beepers: 0 });
    machine!.run();
    expect(machine!.snapshot().world!.robot).toMatchObject({ x: 2, beepers: 1 });
  });

  test('es determinista', () => {
    const program = 'mientras (frente_libre()) { avanzar(); si (hay_zumbador()) { recoger_zumbador(); } }';
    expect(inWorld(program).operations).toBe(inWorld(program).operations);
  });
});

describe('objetivos de un reto', () => {
  const state = () => inWorld('avanzar(); recoger_zumbador(); apagar();').world!;

  test('solo revisa lo que el objetivo indica', () => {
    expect(checkGoal(state(), { robot: { x: 2 } })).toEqual({ ok: true, differences: [] });
    expect(checkGoal(state(), {})).toEqual({ ok: true, differences: [] });
  });

  test('reporta cada diferencia con un mensaje', () => {
    const { ok, differences } = checkGoal(state(), {
      robot: { x: 5, facing: 'este', on: true },
      beepers: [{ x: 4, y: 1, count: 0 }],
    });
    expect(ok).toBe(false);
    expect(differences.map(difference => difference.field)).toEqual(['robot.x', 'robot.on', 'beepers(4, 1)']);
    expect(differences[0]!.message).toContain('se esperaba 5');
    expect(differences[2]).toMatchObject({ expected: 0, actual: 3 });
  });

  test('con `onlyListedBeepers` las demás casillas tienen que quedar vacías', () => {
    const { differences } = checkGoal(state(), { beepers: [], onlyListedBeepers: true });
    expect(differences).toMatchObject([{ field: 'beepers(4, 1)', expected: 0, actual: 3 }]);
  });

  test('pide `apagar()` si el robot tenía que terminar apagado', () => {
    const final = inWorld('avanzar();').world!;
    expect(checkGoal(final, { robot: { on: false } }).differences[0]!.message).toContain('apagar()');
  });
});

describe('docs/modo-mundo.md', async () => {
  const text = await Bun.file(new URL('../docs/modo-mundo.md', import.meta.url)).text();
  const definition = JSON.parse(text.match(/```json\r?\n([\s\S]*?)```/)![1]!) as WorldDefinition;
  const code = text.match(/```codexivo\r?\n([\s\S]*?)```/)![1]!;

  test('el mundo del ejemplo es válido', () => {
    expect(validateWorld(definition).errors).toEqual([]);
  });

  test('la solución del ejemplo cumple lo que dice la guía', () => {
    const result = inWorld(code, definition);
    expect(result.errors).toEqual([]);
    expect(
      checkGoal(result.world!, {
        robot: { x: 1, y: 1, facing: 'oeste', beepers: 4, on: false },
        beepers: [],
        onlyListedBeepers: true,
      }),
    ).toEqual({ ok: true, differences: [] });
  });
});
