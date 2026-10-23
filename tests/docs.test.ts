import { describe, expect, test } from 'bun:test';
import { formatError, run } from '../src';

/**
 * Las guías que describen el lenguaje actual no pueden prometer lo que el código no hace: cada bloque
 * `codexivo` de estos archivos tiene que ejecutarse sin errores. La especificación v1 queda fuera porque
 * describe el diseño futuro.
 */
const DOCUMENTS = ['README.md', 'docs/lenguaje.md', 'docs/recetario.md', 'docs/guia-aprender-desde-el-codigo.md'];

for (const document of DOCUMENTS) {
  describe(document, async () => {
    const text = await Bun.file(new URL(`../${document}`, import.meta.url)).text();
    const blocks = [...text.matchAll(/```codexivo\r?\n([\s\S]*?)```/g)].map(match => match[1]!);

    test('tiene ejemplos', () => {
      expect(blocks.length).toBeGreaterThan(0);
    });

    blocks.forEach((code, index) => {
      test(`ejemplo ${index + 1} se ejecuta`, () => {
        const result = run(code, { input: ['5'], maxOperations: 1_000_000 });
        expect(result.errors.map(formatError)).toEqual([]);
      });
    });
  });
}

describe('docs/especificacion-v1.md §9', async () => {
  const text = await Bun.file(new URL('../docs/especificacion-v1.md', import.meta.url)).text();
  const section = text.slice(text.indexOf('## 9. Ejemplos por nivel'), text.indexOf('## 10.'));
  const blocks = [...section.matchAll(/```codexivo\r?\n([\s\S]*?)```/g)].map(match => match[1]!);

  test('los ejemplos por nivel se ejecutan', () => {
    expect(blocks).toHaveLength(3);
    for (const code of blocks) expect(run(code).errors.map(formatError)).toEqual([]);
  });

  test('FizzBuzz imprime lo esperado', () => {
    const lines = run(blocks[0]!).output.trim().split('\n');
    expect(lines.slice(0, 5)).toEqual(['1', '2', 'Fizz', '4', 'Buzz']);
    expect(lines.at(-1)).toBe('FizzBuzz');
  });
});
