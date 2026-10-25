// Generates the CHANGELOG.md section of a version from the conventional commits since the previous release.
// It runs inside `bun pm version` (the `version` lifecycle script): the release commit then carries its own notes.
// The rules for commit messages are in AGENTS.md («Historial de cambios»).

export interface Commit {
  hash: string;
  subject: string;
  body: string;
  pr?: number;
}

export interface Change {
  type: string;
  scope?: string;
  description: string;
  breaking?: string;
  pr?: number;
  hash: string;
}

export const SECTIONS: [type: string, title: string][] = [
  ['breaking', 'Cambios que rompen compatibilidad'],
  ['feat', 'Novedades'],
  ['fix', 'Correcciones'],
  ['perf', 'Rendimiento'],
  ['docs', 'Documentación'],
  ['other', 'Otros cambios'],
];

/** Types that never reach the changelog: they don't change what a learner or the site sees. */
const INTERNAL = new Set(['chore', 'ci', 'build', 'test', 'refactor', 'style']);
const RELEASE = /^chore\(release\): v/;
const UNRELEASED = 'Sin publicar';
const HEADER = /^(\w+)(?:\(([^)]+)\))?(!)?: (.+)$/;

/** Turns commits into changelog entries; `undefined` for the ones that stay out. */
export function parseCommit(commit: Commit): Change | undefined {
  if (RELEASE.test(commit.subject) || /\[(sin changelog|skip changelog)\]/i.test(commit.body + commit.subject)) {
    return undefined;
  }
  const subject = commit.subject.replace(/\s*\[skip ci\]/gi, '').trim();
  const squashed = subject.match(/^(.*?) \(#(\d+)\)$/);
  const text = squashed ? squashed[1]! : subject;
  const pr = squashed ? Number(squashed[2]) : commit.pr;
  const footer = commit.body.match(/(?:^|\n)BREAKING[ -]CHANGE: ([\s\S]+?)(?=\n\n|\n[\w-]+: |\s*$)/);
  const breaking = footer ? footer[1]!.replace(/\s+/g, ' ').trim() : undefined;
  const header = text.match(HEADER);
  if (!header) return { type: 'other', description: text, breaking, pr, hash: commit.hash };
  const [, type, scope, bang, description] = header;
  if (INTERNAL.has(type!) && !bang && !breaking) return undefined;
  const known = SECTIONS.some(([name]) => name === type);
  return {
    type: known ? type! : 'other',
    scope,
    description: description!,
    breaking: bang || breaking ? (breaking ?? description!) : undefined,
    pr,
    hash: commit.hash,
  };
}

/** Drops a commit and its revert when both are in the same version: the learner never saw either. */
export function dropReverted(commits: Commit[]): Commit[] {
  const dropped = new Set<Commit>();
  for (const commit of commits) {
    const reverted = commit.subject.match(/^Revert "(.+)"$/)?.[1];
    if (!reverted) continue;
    const original = commits.find(other => other.subject === reverted && !dropped.has(other));
    if (!original) continue;
    dropped.add(commit).add(original);
  }
  return commits
    .filter(commit => !dropped.has(commit))
    .map(commit => {
      const reverted = commit.subject.match(/^Revert "(.+)"$/)?.[1];
      return reverted ? { ...commit, subject: `fix: se revierte «${reverted.replace(HEADER, '$4')}»` } : commit;
    });
}

function entry(change: Change, text: string, repository: string): string {
  const scope = change.scope ? `**${change.scope}**: ` : '';
  const reference = change.pr
    ? `[#${change.pr}](${repository}/pull/${change.pr})`
    : `[${change.hash.slice(0, 7)}](${repository}/commit/${change.hash})`;
  return `- ${scope}${capitalize(text)} (${reference}).`;
}

function capitalize(text: string): string {
  const trimmed = text.replace(/\.$/, '');
  return trimmed.charAt(0).toLocaleUpperCase('es') + trimmed.slice(1);
}

export function renderSection(
  version: string,
  date: string,
  commits: Commit[],
  repository: string,
  notes = '',
): string {
  const changes = dropReverted(commits)
    .map(parseCommit)
    .filter(change => change !== undefined);
  const lines = [`## ${version} (${date})`, ''];
  if (notes.trim()) lines.push(notes.trim(), '');
  for (const [type, title] of SECTIONS) {
    const items =
      type === 'breaking'
        ? changes.filter(change => change.breaking).map(change => entry(change, change.breaking!, repository))
        : changes.filter(change => change.type === type).map(change => entry(change, change.description, repository));
    if (items.length > 0) lines.push(`### ${title}`, '', ...items, '');
  }
  if (changes.length === 0 && !notes.trim()) lines.push('Sin cambios visibles: mantenimiento interno.', '');
  return lines.join('\n');
}

interface Parsed {
  head: string;
  notes: string;
  sections: { version: string; text: string }[];
}

function parseChangelog(changelog: string): Parsed {
  const parts = changelog.split(/^(?=## )/m);
  const head = parts.shift() ?? '';
  let notes = '';
  const sections: Parsed['sections'] = [];
  for (const text of parts) {
    const title = text.match(/^## (\S+)/)![1]!;
    if (text.startsWith(`## ${UNRELEASED}`)) notes = text.replace(/^.*\n/, '');
    else sections.push({ version: title, text });
  }
  return { head, notes, sections };
}

/** The hand-written notes under «## Sin publicar», which the next version takes as its introduction. */
export function unreleasedNotes(changelog: string): string {
  return parseChangelog(changelog).notes.trim();
}

/** Puts a new version on top and removes «## Sin publicar», whose notes the section already includes. */
export function insertSection(changelog: string, version: string, section: string): string {
  const { head, sections } = parseChangelog(changelog);
  if (sections.some(existing => existing.version === version)) {
    throw new Error(`CHANGELOG.md ya tiene la versión ${version}.`);
  }
  const versions = [section, ...sections.map(existing => existing.text)].map(text => `${text.trimEnd()}\n`);
  return `${head.trimEnd()}\n\n${versions.join('\n')}`;
}

/** The body of a version (without its heading), for the GitHub release. */
export function extractSection(changelog: string, version: string): string | undefined {
  const section = parseChangelog(changelog).sections.find(existing => existing.version === version);
  return section?.text.replace(/^.*\n/, '').trim();
}

function git(...args: string[]): string {
  const result = Bun.spawnSync(['git', ...args], { stderr: 'pipe' });
  if (result.exitCode !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr.toString().trim()}`);
  return result.stdout.toString().trim();
}

/** Commits between the previous release and `until`, each with the pull request that merged it. */
export function readCommits(until: string, since?: string): Commit[] {
  const from = since ?? (git('log', '-1', '--format=%H', '-E', `--grep=${RELEASE.source}`, until) || undefined);
  const range = from ? `${from}..${until}` : until;
  const pullRequests = new Map<string, number>();
  for (const line of git('log', '--merges', '--first-parent', '--format=%H %P%x1f%s', range).split('\n')) {
    const [hashes, subject] = line.split('\x1f');
    const pr = subject?.match(/^Merge pull request #(\d+)/)?.[1];
    if (!pr) continue;
    const [, first, second] = hashes!.split(' ');
    for (const hash of git('rev-list', `${first}..${second}`).split('\n')) pullRequests.set(hash, Number(pr));
  }
  return git('log', '--no-merges', '--reverse', '--format=%H%x1f%s%x1f%b%x1e', range)
    .split('\x1e')
    .map(record => record.trim())
    .filter(Boolean)
    .map(record => {
      const [hash, subject, body] = record.split('\x1f');
      return { hash: hash!, subject: subject!, body: body ?? '', pr: pullRequests.get(hash!) };
    });
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

if (import.meta.main) {
  const path = 'CHANGELOG.md';
  const changelog = await Bun.file(path).text();
  const notesFor = option('--notas');
  if (notesFor) {
    const body = extractSection(changelog, notesFor.replace(/^v/, ''));
    if (body === undefined) {
      console.error(`CHANGELOG.md no tiene la versión ${notesFor}.`);
      process.exit(1);
    }
    console.log(body);
    process.exit(0);
  }

  const pkg = await Bun.file('package.json').json();
  // The preview runs before `bun pm version`, so it doesn't know the next number yet.
  const version = option('--version') ?? (process.argv.includes('--imprimir') ? 'próxima' : pkg.version);
  const until = option('--hasta') ?? 'HEAD';
  const date = option('--hasta') ? git('log', '-1', '--format=%cs', until) : new Date().toISOString().slice(0, 10);
  const repository = pkg.repository.url.replace(/^git\+/, '').replace(/\.git$/, '');
  const notes = unreleasedNotes(changelog);
  const section = renderSection(version, date, readCommits(until, option('--desde')), repository, notes);
  if (process.argv.includes('--imprimir')) {
    console.log(section);
    process.exit(0);
  }
  await Bun.write(path, insertSection(changelog, version, section));
  const format = Bun.spawn([process.execPath, 'fmt', path], { stdout: 'inherit', stderr: 'inherit' });
  process.exit(await format.exited);
}
