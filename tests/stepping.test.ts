import { describe, expect, test } from 'bun:test';
import { prepare, run, Session } from '../src';
import type { MachineEvent } from '../src';

const machineFor = (source: string, options = {}) => {
  const { machine, errors } = prepare(source, options);
  expect(errors).toEqual([]);
  return machine!;
};

describe('ejecución paso a paso', () => {
  test('step() se detiene en cada sentencia y en cada decisión', () => {
    const machine = machineFor('variable x = 1;\nsi (x > 0) {\n  x = 2;\n}\nx;');
    const stops: string[] = [];
    while (!machine.done) {
      machine.step();
      const { span } = machine.snapshot();
      stops.push(`${machine.status}@${span?.start.line}`);
    }
    // variable, si, decisión del si, asignación, última expresión, fin
    expect(stops).toEqual(['pausada@1', 'pausada@2', 'pausada@2', 'pausada@3', 'pausada@5', 'terminada@5']);
    expect(machine.result).toBe(2);
  });

  test('snapshot() muestra las variables de cada alcance y el contenido de las listas', () => {
    const machine = machineFor(
      `
      variable lista = [1, 2];
      variable doble = procedimiento(n) {
        variable resultado = n * 2;
        regresa resultado;
      };
      doble(21);
    `,
      { breakpoints: [5] },
    );
    machine.run();
    expect(machine.status).toBe('pausada');
    const snapshot = machine.snapshot();
    expect(snapshot.frames.map(frame => frame.name)).toEqual(['programa', 'doble']);
    const [global, call] = snapshot.frames;
    expect(Object.keys(global!.scopes[0]!)).toEqual(['lista', 'doble']);
    expect(call!.scopes[0]).toMatchObject({
      n: { type: 'número', value: 21 },
      resultado: { type: 'número', value: 42 },
    });
    const list = global!.scopes[0]!.lista!;
    expect(list.type).toBe('lista');
    const items = list.type === 'lista' ? snapshot.heap[list.ref] : undefined;
    expect(Array.isArray(items) && items.map(item => item.repr)).toEqual(['1', '2']);
    machine.run();
    expect(machine.result).toBe(42);
  });

  test('run(budget) cede el control después de cierta cantidad de operaciones', () => {
    const machine = machineFor('variable i = 0; mientras (i < 1000) { i += 1; } i;');
    let slices = 0;
    while (machine.run(500) === 'pausada') slices += 1;
    expect(slices).toBeGreaterThan(5);
    expect(machine.status).toBe('terminada');
    expect(machine.result).toBe(1000);
  });

  test('leer() puede esperar a que llegue la entrada', () => {
    const machine = machineFor('variable nombre = leer();\nimprimir("Hola,", nombre);', { interactiveInput: true });
    expect(machine.run()).toBe('esperando_entrada');
    machine.provideInput('Ana');
    expect(machine.run()).toBe('terminada');
    expect(machine.output).toBe('Hola, Ana\n');
  });

  test('closeInput() hace que leer() regrese nulo en lugar de esperar', () => {
    const machine = machineFor('leer();', { interactiveInput: true });
    expect(machine.run()).toBe('esperando_entrada');
    machine.closeInput();
    expect(machine.run()).toBe('terminada');
    expect(machine.result).toBe(null);
  });

  test('esperar entrada no cuenta operaciones de más', () => {
    const source = 'imprimir(leer());';
    const waited = machineFor(source, { interactiveInput: true });
    waited.run();
    waited.provideInput('x');
    waited.run();
    expect(waited.operations).toBe(run(source, { input: ['x'] }).operations);
  });
});

describe('biblioteca escrita en Codexivo', () => {
  test('step() se detiene dentro de `f`, pero no en el código de `mapear`', () => {
    const machine = machineFor('variable r = mapear([1, 2], procedimiento(x) {\n  regresa x * 2;\n});\nr;');
    const lines: number[] = [];
    while (!machine.done) {
      machine.step();
      if (!machine.done) lines.push(machine.snapshot().span!.start.line);
    }
    // la declaración, una vez por cada elemento dentro de `f`, y la última expresión
    expect(lines).toEqual([1, 2, 2, 4]);
    expect(machine.result).toMatchObject({ kind: 'lista', items: [2, 4] });
  });

  test('snapshot() muestra el marco de la biblioteca sin sus variables', () => {
    const machine = machineFor('mapear([1], procedimiento(x) {\n  regresa x;\n});', { breakpoints: [2] });
    machine.run();
    const frames = machine.snapshot().frames;
    expect(frames.map(frame => frame.name)).toEqual(['programa', 'mapear', 'f']);
    expect(frames[1]).toMatchObject({ library: true, scopes: [] });
    expect(frames[2]!.scopes[0]).toMatchObject({ x: { repr: '1' } });
  });

  test('los eventos muestran las llamadas a `f`, no los pasos internos', () => {
    const list = run('ordenar([2, 1], procedimiento(a, b) { regresa a < b; });', { trace: true }).events!;
    expect(list.filter(event => event.type === 'llama').map(event => (event as { name: string }).name)).toEqual([
      'ordenar',
      'va_antes',
    ]);
    expect(list.filter(event => event.type === 'declara')).toEqual([]);
    // la sentencia del programa y la del comparador; ninguna de `ordenar`
    expect(list.filter(event => event.type === 'paso')).toHaveLength(2);
  });
});

describe('eventos', () => {
  const events = (source: string, options = {}) => run(source, { trace: true, ...options }).events!;
  const of = <T extends MachineEvent['type']>(list: MachineEvent[], type: T) =>
    list.filter((event): event is Extract<MachineEvent, { type: T }> => event.type === type);

  test('declaraciones y asignaciones con su valor anterior', () => {
    const list = events('variable x = 1; x += 4;');
    expect(of(list, 'declara')[0]).toMatchObject({ name: 'x', value: { repr: '1' } });
    expect(of(list, 'asigna')[0]).toMatchObject({ name: 'x', before: { repr: '1' }, after: { repr: '5' } });
  });

  test('decisiones con la rama que se tomó', () => {
    const list = events('variable i = 0; mientras (i < 2) { i += 1; }');
    expect(of(list, 'decide').map(event => `${event.label}:${event.value}`)).toEqual([
      'mientras:true',
      'mientras:true',
      'mientras:false',
    ]);
  });

  test('cada vuelta de `repetir` es una decisión', () => {
    const list = events('repetir 2 veces { }');
    expect(of(list, 'decide').map(event => `${event.label}:${event.value}`)).toEqual([
      'repetir:true',
      'repetir:true',
      'repetir:false',
    ]);
  });

  test('cada vuelta de `para_cada` decide y declara la variable', () => {
    const list = events('para_cada x en [1, 2] { }');
    expect(of(list, 'decide').map(event => `${event.label}:${event.value}`)).toEqual([
      'para_cada:true',
      'para_cada:true',
      'para_cada:false',
    ]);
    expect(of(list, 'declara').map(event => `${event.name}=${event.value.repr}`)).toEqual(['x=1', 'x=2']);
  });

  test('`modifica` describe el cambio de un elemento', () => {
    const list = events('variable l = [1, 2]; l[1] += 3;');
    const declared = of(list, 'declara')[0]!.value;
    expect(of(list, 'modifica')[0]).toMatchObject({
      key: { repr: '1' },
      before: { repr: '2' },
      after: { repr: '5' },
    });
    if (declared.type === 'lista') expect(of(list, 'modifica')[0]!.ref).toBe(declared.ref);
  });

  test('los procedimientos con nombre se declaran al entrar a su bloque', () => {
    const list = events('variable x = 1; procedimiento f() { }');
    expect(of(list, 'declara').map(event => event.name)).toEqual(['f', 'x']);
  });

  test('`modifica` también describe claves de diccionario, incluso nuevas', () => {
    const [event] = of(events('variable d = {}; d.x = 1;'), 'modifica');
    expect(event).toMatchObject({ key: { repr: '"x"' }, before: { repr: 'nulo' }, after: { repr: '1' } });
  });

  test('snapshot() incluye los diccionarios por referencia', () => {
    const machine = machineFor('variable d = { "a": [1] };\nd;', { breakpoints: [2] });
    machine.run();
    const snapshot = machine.snapshot();
    const d = snapshot.frames[0]!.scopes[0]!.d!;
    expect(d).toMatchObject({ type: 'diccionario', size: 1, repr: '{"a": [1]}' });
    if (d.type !== 'diccionario') return;
    const entry = snapshot.heap[d.ref];
    expect(entry).toMatchObject({ entries: [{ key: { repr: '"a"' }, value: { type: 'lista' } }] });
    const list = !Array.isArray(entry) && entry?.entries[0]!.value;
    if (list && list.type === 'lista') expect(snapshot.heap[list.ref]).toMatchObject([{ repr: '1' }]);
  });

  test('`declara` indica si es constante', () => {
    const list = of(events('constante K = 1; variable x = 2;'), 'declara');
    expect(list.map(event => `${event.name}:${event.constant}`)).toEqual(['K:true', 'x:false']);
  });

  test('`i++` asigna y opera', () => {
    const list = events('variable i = 1; i++;');
    expect(of(list, 'asigna')[0]).toMatchObject({ name: 'i', before: { repr: '1' }, after: { repr: '2' } });
    expect(of(list, 'opera')[0]).toMatchObject({ operator: '+', result: { repr: '2' } });
  });

  test('`mod` y `%` se ven igual en los eventos', () => {
    const operators = (source: string) => of(events(source), 'opera').map(event => event.operator);
    expect(operators('7 % 2;')).toEqual(['mod']);
    expect(operators('7 mod 2;')).toEqual(['mod']);
  });

  test('operaciones con sus operandos', () => {
    const [operation] = of(events('2 * 3 + 1;'), 'opera');
    expect(operation).toMatchObject({ operator: '*', operands: [{ repr: '2' }, { repr: '3' }], result: { repr: '6' } });
  });

  test('llamadas y retornos con su profundidad', () => {
    const list = events('variable f = procedimiento(n) { regresa n + 1; }; f(1);');
    expect(of(list, 'llama')[0]).toMatchObject({ name: 'f', args: [{ repr: '1' }], depth: 1 });
    expect(of(list, 'regresa')[0]).toMatchObject({ name: 'f', value: { repr: '2' }, depth: 2 });
  });

  test('salida, entrada, errores y fin', () => {
    expect(of(events('imprimir(leer());', { input: ['hola'] }), 'imprime')[0]?.text).toBe('hola\n');
    expect(of(events('1 / 0;'), 'error')[0]?.error.code).toBe('DIVISIÓN_ENTRE_CERO');
    expect(of(events('1 + 1;'), 'fin')[0]?.result.repr).toBe('2');
  });

  test('los eventos se pueden limitar', () => {
    const result = run('variable i = 0; mientras (i < 100) { i += 1; }', { trace: true, maxEvents: 10 });
    expect(result.events).toHaveLength(10);
    expect(result.eventsTruncated).toBe(true);
  });
});

describe('sesiones', () => {
  test('las variables se conservan entre ejecuciones', () => {
    const session = new Session();
    session.run('variable x = 1;');
    session.run('variable x = x + 1;');
    expect(session.run('x * 10;').resultText).toBe('20');
  });
});
