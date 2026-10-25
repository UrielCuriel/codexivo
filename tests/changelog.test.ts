import { describe, expect, test } from 'bun:test';
import {
  dropReverted,
  extractSection,
  insertSection,
  parseCommit,
  renderSection,
  unreleasedNotes,
  type Commit,
} from '../scripts/changelog';

const repository = 'https://github.com/UrielCuriel/codexivo';
let counter = 0;
const commit = (subject: string, body = '', pr?: number): Commit => ({
  hash: String(++counter).padStart(40, 'a'),
  subject,
  body,
  pr,
});

describe('historial de cambios', () => {
  test('lee el tipo, el ámbito y el pull request de un commit convencional', () => {
    expect(parseCommit(commit('feat(cli): leer archivos desde la entrada', '', 7))).toMatchObject({
      type: 'feat',
      scope: 'cli',
      description: 'leer archivos desde la entrada',
      pr: 7,
    });
    expect(parseCommit(commit('fix: el `;` final (#12)'))).toMatchObject({ type: 'fix', pr: 12 });
  });

  test('deja fuera los cambios internos y los commits de versión', () => {
    for (const subject of ['chore: limpiar', 'test: más casos', 'refactor: separar', 'chore(release): v1.0.0']) {
      expect(parseCommit(commit(subject))).toBeUndefined();
    }
    expect(parseCommit(commit('feat: experimento', '[sin changelog]'))).toBeUndefined();
  });

  test('marca los cambios que rompen compatibilidad, con `!` o con el pie BREAKING CHANGE', () => {
    expect(parseCommit(commit('feat!: `div` es palabra reservada'))?.breaking).toBe('`div` es palabra reservada');
    const footer = parseCommit(commit('refactor: mover el catálogo', 'BREAKING CHANGE: `catalog` se importa\naparte.'));
    expect(footer?.breaking).toBe('`catalog` se importa aparte.');
  });

  test('un commit revertido en la misma versión desaparece junto con su revert', () => {
    const commits = dropReverted([
      commit('feat: algo'),
      commit('fix: conservar el `;`'),
      commit('Revert "fix: conservar el `;`"'),
      commit('Revert "feat: de antes"'),
    ]);
    expect(commits.map(item => item.subject)).toEqual(['feat: algo', 'fix: se revierte «de antes»']);
  });

  test('agrupa las entradas por sección, con enlace al pull request o al commit', () => {
    const section = renderSection(
      '1.1.0',
      '2026-10-25',
      [
        commit('feat: dominios', '', 19),
        { ...commit('fix(lexer): números con `_`'), hash: 'b'.repeat(40) },
        commit('chore: ci'),
      ],
      repository,
    );
    expect(section).toBe(
      [
        '## 1.1.0 (2026-10-25)',
        '',
        '### Novedades',
        '',
        `- Dominios ([#19](${repository}/pull/19)).`,
        '',
        '### Correcciones',
        '',
        `- **lexer**: Números con \`_\` ([bbbbbbb](${repository}/commit/${'b'.repeat(40)})).`,
        '',
      ].join('\n'),
    );
  });

  test('una versión sin cambios visibles lo dice', () => {
    expect(renderSection('1.0.3', '2026-10-25', [commit('chore: ci')], repository)).toContain(
      'Sin cambios visibles: mantenimiento interno.',
    );
  });

  test('las notas de «Sin publicar» pasan a ser la introducción de la versión nueva', () => {
    const changelog =
      '# Historial\n\n## Sin publicar\n\nPrimera versión estable.\n\n## 1.0.0 (2026-10-01)\n\n- Algo.\n';
    const notes = unreleasedNotes(changelog);
    expect(notes).toBe('Primera versión estable.');
    const updated = insertSection(changelog, '1.1.0', renderSection('1.1.0', '2026-10-25', [], repository, notes));
    expect(updated).toBe(
      '# Historial\n\n## 1.1.0 (2026-10-25)\n\nPrimera versión estable.\n\n## 1.0.0 (2026-10-01)\n\n- Algo.\n',
    );
    expect(extractSection(updated, '1.1.0')).toBe('Primera versión estable.');
  });

  test('no repite una versión que ya está en el historial', () => {
    expect(() => insertSection('# H\n\n## 1.0.0\n\n- Algo.\n', '1.0.0', '## 1.0.0\n')).toThrow(
      'ya tiene la versión 1.0.0',
    );
  });
});
