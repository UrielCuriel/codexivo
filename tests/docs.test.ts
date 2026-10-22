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
