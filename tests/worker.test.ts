import { afterEach, describe, expect, test } from 'bun:test';
import { createSandbox, evaluarReto } from '../src';
import type { Progress, Sandbox, WorkerLike } from '../src';

const sandboxes: Sandbox[] = [];

/** Un sandbox con un worker real de Bun, como lo usaría la página. */
const open = (): Sandbox => {
  const worker = new Worker(new URL('../src/worker.ts', import.meta.url).href, { type: 'module' });
  const sandbox = createSandbox(worker as unknown as WorkerLike);
  sandboxes.push(sandbox);
  return sandbox;
};

/** El mensaje con el que se rechaza una promesa (o `''` si se cumple). */
const rejection = (promise: Promise<unknown>) =>
  promise.then(
    () => '',
    (error: Error) => error.message,
  );

afterEach(() => {
  while (sandboxes.length > 0) sandboxes.pop()!.terminate();
});

describe('worker del sandbox', () => {
  test('cargar regresa tokens, AST y errores de sintaxis', async () => {
    const sandbox = open();
    const ok = await sandbox.load('variable x = 1;');
    expect(ok.errors).toEqual([]);
    expect(ok.program.statements[0]!.kind).toBe('VariableDeclaration');
    expect(ok.tokens.length).toBeGreaterThan(3);

    const broken = await sandbox.load('variable = 1;');
    expect(broken.errors[0]!.code).toBe('NOMBRE_ESPERADO');
    expect(await rejection(sandbox.run())).toContain('No hay un programa cargado');
  });

  test('cargar con `parseTrace` trae la traza del parser', async () => {
    const sandbox = open();
    expect((await sandbox.load('1 + 2')).parseTrace).toBeUndefined();
    const loaded = await sandbox.load('1 + 2 * 3', { parseTrace: true });
    expect(loaded.parseTrace!.filter(event => event.type === 'precedence')).toHaveLength(2);
    expect(loaded.parseTrace!.at(-1)).toMatchObject({ type: 'exit', kind: 'Program', id: loaded.program.id });
  });

  test('ejecutar hasta terminar, con la salida y el resultado', async () => {
    const sandbox = open();
    await sandbox.load('imprimir("hola");\n2 + 3;');
    const stopped = await sandbox.run();
    expect(stopped).toMatchObject({ status: 'terminada', reason: 'fin', output: 'hola\n', result: { repr: '5' } });
  });

  test('un bucle infinito se ejecuta en tandas y se puede pausar', async () => {
    const sandbox = open();
    await sandbox.load('variable i = 0;\nmientras (verdadero) {\n  i++;\n}', {
      batchSize: 10_000,
      maxOperations: 1_000_000_000,
      detail: 'nada',
    });
    const batches: Progress[] = [];
    let paused = false;
    sandbox.onProgress(progress => {
      batches.push(progress);
      if (!paused && batches.length >= 3) {
        paused = true;
        void sandbox.pause();
      }
    });
    const stopped = await sandbox.run();
    expect(stopped).toMatchObject({ status: 'pausada', reason: 'pausa' });
    expect(batches.length).toBeGreaterThanOrEqual(3);
    expect(batches[1]!.operations).toBeGreaterThan(batches[0]!.operations);
    // Se puede continuar después de pausar.
    const { snapshot } = await sandbox.step();
    expect(snapshot.status).toBe('pausada');
  });

  test('paso a paso, con los eventos agrupados', async () => {
    const sandbox = open();
    await sandbox.load('variable x = 1;\nsi (x > 0) {\n  x = 2;\n}');
    const first = await sandbox.step();
    expect(first).toMatchObject({ reason: 'paso', steps: 1 });
    expect(first.events.map(event => event.type)).toEqual(['paso']);
    await sandbox.step();
    const decision = await sandbox.step();
    expect(decision.events.map(event => event.type)).toEqual(['decide']);
    expect(decision.snapshot.frames[0]!.scopes[0]).toMatchObject({ x: { repr: '1' } });
  });

  test('`leer()` interactivo espera la entrada', async () => {
    const sandbox = open();
    await sandbox.load('variable nombre = leer();\nimprimir("Hola,", nombre);');
    const waiting = await sandbox.run();
    expect(waiting).toMatchObject({ status: 'esperando_entrada', reason: 'entrada' });
    await sandbox.provideInput('Ana');
    const done = await sandbox.run();
    expect(done).toMatchObject({ status: 'terminada', output: 'Hola, Ana\n' });
  });

  test('cerrar la entrada hace que `leer()` regrese nulo', async () => {
    const sandbox = open();
    await sandbox.load('leer();');
    await sandbox.run();
    await sandbox.closeInput();
    expect((await sandbox.run()).result).toMatchObject({ repr: 'nulo' });
  });

  test('puntos de interrupción: `continuar` se detiene en ellos y `ejecutar` no', async () => {
    const sandbox = open();
    await sandbox.load('variable a = 1;\nvariable b = 2;\nvariable c = 3;', { breakpoints: [2] });
    const atTwo = await sandbox.resume();
    expect(atTwo.reason).toBe('punto_de_interrupción');
    expect(atTwo.snapshot.span!.start.line).toBe(1);
    await sandbox.setBreakpoints([3]);
    const atThree = await sandbox.resume();
    expect(atThree.reason).toBe('punto_de_interrupción');
    expect(Object.keys(atThree.snapshot.frames[0]!.scopes[0]!)).toEqual(['a', 'b']);
    expect((await sandbox.run()).status).toBe('terminada');
  });

  test('retroceder llega exactamente al mismo estado', async () => {
    const sandbox = open();
    const source =
      'variable l = [];\nrepetir 3 veces {\n  agregar(l, aleatorio(1, 100));\n}\nvariable n = leer_número();\nimprimir(l, n);';
    await sandbox.load(source, { seed: 7 });
    const snapshots = [];
    for (let i = 0; i < 6; i++) snapshots.push((await sandbox.step()).snapshot);
    const waiting = await sandbox.run();
    expect(waiting.status).toBe('esperando_entrada');
    await sandbox.provideInput('42');
    const done = await sandbox.run();
    expect(done.status).toBe('terminada');

    const back = await sandbox.goToStep(3);
    expect(back).toMatchObject({ reason: 'retroceso', steps: 3, replaceOutput: true, output: '' });
    expect(back.snapshot).toEqual(snapshots[2]!);

    // Y desde ahí, con la entrada guardada, termina igual.
    const again = await sandbox.run();
    expect(again.output).toBe(done.output);
    expect(again.operations).toBe(done.operations);
  });

  test('los errores llegan con su código', async () => {
    const sandbox = open();
    await sandbox.load('variable x = 1 / 0;');
    const stopped = await sandbox.run();
    expect(stopped).toMatchObject({ status: 'error', reason: 'error', error: { code: 'DIVISIÓN_ENTRE_CERO' } });
  });

  test('una orden mientras se ejecuta es un error del protocolo', async () => {
    const sandbox = open();
    await sandbox.load('mientras (verdadero) { }', { batchSize: 1_000, maxOperations: 1_000_000_000, detail: 'nada' });
    const running = sandbox.run();
    expect(await rejection(sandbox.step())).toContain('sigue en curso');
    await sandbox.pause();
    expect((await running).reason).toBe('pausa');
  });

  test('modo mundo en el worker', async () => {
    const sandbox = open();
    await sandbox.load('avanzar();', {
      world: { version: 1, width: 3, height: 1, robot: { x: 1, y: 1, facing: 'este', beepers: 0 } },
    });
    const stopped = await sandbox.run();
    expect(stopped.snapshot.world!.robot.x).toBe(2);
    expect(stopped.events.filter(event => event.type === 'robot')).toHaveLength(1);
  });

  test('evaluar un reto desde el worker', async () => {
    const sandbox = open();
    const result = await sandbox.evaluarReto('imprimir(leer_número() * 2);', {
      style: 'salida',
      cases: [{ input: '4', expectedOutput: '8' }],
    });
    expect(result.passed).toBe(true);
  });
});

describe('retos', () => {
  test('estilo salida: compara lo que imprime', () => {
    const result = evaluarReto('variable n = leer_número();\nimprimir(n * n);', {
      style: 'salida',
      cases: [
        { name: 'positivo', input: '3', expectedOutput: '9\n' },
        { name: 'negativo', input: ['-4'], expectedOutput: '16' },
        { name: 'mal', input: '2', expectedOutput: '5' },
      ],
    });
    expect(result.passed).toBe(false);
    expect(result.cases.map(testCase => [testCase.name, testCase.passed])).toEqual([
      ['positivo', true],
      ['negativo', true],
      ['mal', false],
    ]);
    expect(result.cases[2]).toMatchObject({ output: '4\n', expectedOutput: '5' });
    expect(result.cases[0]!.operations).toBeGreaterThan(0);
  });

  test('estilo salida exacto', () => {
    const result = evaluarReto('imprimir("a ");', {
      style: 'salida',
      exactOutput: true,
      cases: [{ expectedOutput: 'a\n' }],
    });
    expect(result.passed).toBe(false);
  });

  test('estilo regresa: llama a `resolver` y compara por valor', () => {
    const source = `
      procedimiento resolver(lista, objetivo) {
        variable vistos = {};
        para_cada i en índices(lista) {
          variable falta = objetivo - lista[i];
          si (tiene(vistos, falta)) {
            regresa [vistos[falta], i];
          }
          vistos[lista[i]] = i;
        }
        regresa [];
      }
    `;
    const result = evaluarReto(source, {
      style: 'regresa',
      cases: [
        { args: [[2, 7, 11, 15], 9], expected: [0, 1] },
        { args: [[3, -2, 4], 2], expected: [1, 2] },
        { args: [[1], 5], expected: [] },
        { args: [[1, 1], 2], expected: [0, 0] },
      ],
    });
    expect(result.cases.map(testCase => testCase.passed)).toEqual([true, true, true, false]);
    expect(result.cases[3]).toMatchObject({ result: '[0, 1]', expected: '[0, 0]' });
  });

  test('los diccionarios de JSON se comparan sin importar el orden', () => {
    const result = evaluarReto('procedimiento resolver(d) { d.c = 3; regresa d; }', {
      style: 'regresa',
      cases: [{ args: [{ a: 1, b: 'x' }], expected: { c: 3, b: 'x', a: 1 } }],
    });
    expect(result.passed).toBe(true);
  });

  test('cada caso tiene su límite de operaciones y sus errores', () => {
    const result = evaluarReto('procedimiento resolver(n) { mientras (verdadero) { } }', {
      style: 'regresa',
      maxOperations: 500,
      cases: [{ args: [1], expected: 1 }],
    });
    expect(result.cases[0]).toMatchObject({ passed: false, error: { code: 'DEMASIADAS_OPERACIONES' } });

    const missing = evaluarReto('variable x = 1;', { style: 'regresa', cases: [{ args: [], expected: 1 }] });
    expect(missing.cases[0]!.error!.code).toBe('NOMBRE_DESCONOCIDO');

    const syntax = evaluarReto('variable = ;', { style: 'salida', cases: [{ expectedOutput: '' }] });
    expect(syntax.cases[0]!.error!.code).toBe('NOMBRE_ESPERADO');
  });

  test('es determinista: las mismas operaciones cada vez', () => {
    const challenge = { style: 'regresa' as const, cases: [{ args: [[5, 3, 1]], expected: [1, 3, 5] }] };
    const source = 'procedimiento resolver(l) { regresa ordenar(l); }';
    expect(evaluarReto(source, challenge).cases[0]!.operations).toBe(
      evaluarReto(source, challenge).cases[0]!.operations,
    );
  });
});
