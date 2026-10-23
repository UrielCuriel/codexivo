/**
 * Genera, desde el catálogo, las tablas de la biblioteca en Markdown: `bun run docs:biblioteca`.
 * Escribe en la salida estándar para pegarlas en `docs/lenguaje.md` o en el sitio.
 */
import { catalog } from '../src';

const signature = (entry: (typeof catalog.library)[number]): string => {
  const params = entry.params.map((param, index) => {
    const last = index === entry.params.length - 1;
    const name = param.optional ? `${param.name}?` : param.name;
    return last && entry.variadic ? `${name}, …` : name;
  });
  return `\`${entry.name}(${params.join(', ')})\``;
};

const lines: string[] = [];
for (const category of catalog.categories) {
  const entries = catalog.library.filter(entry => entry.category === category);
  if (entries.length === 0) continue;
  lines.push(`### ${category[0]!.toUpperCase()}${category.slice(1)}`, '');
  lines.push('| Procedimiento | Regresa | Qué hace |', '| --- | --- | --- |');
  for (const entry of entries) {
    const changes = entry.mutates ? ' (cambia su primer argumento)' : '';
    const cell = (text: string) => text.replaceAll('|', '\\|');
    lines.push(`| ${signature(entry)} | ${cell(entry.returns)} | ${cell(entry.description)}${changes} |`);
  }
  lines.push('');
}
console.log(lines.join('\n'));
