import { describe, expect, test } from 'bun:test';
import { catalog, createWorld, KEYWORDS, natives, run } from '../src';
import { libraryProcedures } from '../src/runtime/prelude';
import { keywordGroup } from '../src/catalog';

describe('catálogo', () => {
  test('es serializable', () => {
    expect(JSON.parse(JSON.stringify(catalog))).toEqual(catalog);
  });

  test('cada palabra reservada está en un grupo', () => {
    expect(Object.keys(KEYWORDS).filter(word => !keywordGroup(word))).toEqual([]);
    expect(catalog.keywords.flatMap(group => group.words).sort()).toEqual(Object.keys(KEYWORDS).sort());
  });

  test('cada procedimiento de la biblioteca tiene su entrada, y viceversa', () => {
    const registered = new Set([
      ...Object.values(natives).map(native => native.name),
      ...Object.keys(libraryProcedures),
      ...Object.keys(createWorld(catalog.exampleWorld).natives),
    ]);
    const documented = new Set(catalog.library.map(entry => entry.name));
    expect([...registered].filter(name => !documented.has(name))).toEqual([]);
    expect([...documented].filter(name => !registered.has(name))).toEqual([]);
  });

  test('los alias sin acento son los que acepta el intérprete', () => {
    for (const entry of catalog.library) {
      for (const alias of entry.aliases) expect(natives[alias] ?? libraryProcedures[alias]).toBeDefined();
    }
    expect(catalog.library.find(entry => entry.name === 'máximo')!.aliases).toEqual(['maximo']);
  });

  test('cada entrada tiene descripción, firma y al menos un ejemplo', () => {
    for (const entry of catalog.library) {
      expect(entry.description.length).toBeGreaterThan(10);
      expect(entry.examples.length).toBeGreaterThan(0);
      expect(catalog.categories).toContain(entry.category);
      expect(entry.returns.length).toBeGreaterThan(0);
    }
  });

  describe('los ejemplos se ejecutan y dan lo que dicen', () => {
    for (const entry of catalog.library) {
      entry.examples.forEach((example, index) => {
        test(`${entry.name} ${index + 1}`, () => {
          const world = entry.category === 'mundo' ? createWorld(catalog.exampleWorld) : undefined;
          const result = run(example.code, { seed: 1, ...(world ? { world } : {}) });
          expect(result.errors).toEqual([]);
          if (example.result !== undefined) expect(result.resultText).toBe(example.result);
          if (example.output !== undefined) expect(result.output).toBe(example.output);
        });
      });
    }
  });

  test('cada código de error que se usa en `src/` está en el catálogo, y viceversa', async () => {
    const glob = new Bun.Glob('**/*.ts');
    const used = new Set<string>();
    // `fileURLToPath` y `absolute` para que las rutas funcionen también en Windows.
    const root = Bun.fileURLToPath(new URL('../src', import.meta.url));
    for await (const path of glob.scan({ cwd: root, absolute: true })) {
      if (path.endsWith('token.ts') || path.endsWith('error-codes.ts')) continue;
      const text = await Bun.file(path).text();
      for (const match of text.matchAll(/'([A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ_]{2,})'/g)) used.add(match[1]!);
    }
    used.delete('NFD'); // `normalize('NFD')`, no es un código
    const documented = new Set(catalog.errors.map(error => error.code));
    expect([...used].filter(code => !documented.has(code)).sort()).toEqual([]);
    expect([...documented].filter(code => !used.has(code)).sort()).toEqual([]);
  });

  test('los operadores siguen la precedencia de la spec', () => {
    const precedence = (symbol: string) => catalog.operators.find(operator => operator.symbol === symbol)!.precedence;
    expect(precedence('^')).toBeGreaterThan(precedence('*'));
    expect(precedence('*')).toBeGreaterThan(precedence('+'));
    expect(catalog.operators.find(operator => operator.word === 'mod')!.symbol).toBe('%');
  });

  test('las constantes', () => {
    expect(catalog.constants).toEqual([expect.objectContaining({ name: 'PI', value: Math.PI })]);
  });
});
