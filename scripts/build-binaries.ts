import { chmod, copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const targets = [
  'bun-linux-x64',
  'bun-linux-arm64',
  'bun-linux-x64-musl',
  'bun-linux-arm64-musl',
  'bun-darwin-x64',
  'bun-darwin-arm64',
  'bun-windows-x64',
  'bun-windows-arm64',
] as const;

const args = Bun.argv.slice(2);
const report = process.report.getReport() as { header: { glibcVersionRuntime?: string } };
const musl = process.platform === 'linux' && !report.header.glibcVersionRuntime;
const target = args[0] ?? `bun-${process.platform === 'win32' ? 'windows' : process.platform}-${process.arch}${musl ? '-musl' : ''}`;
if (args.length > 1 || (target !== '--all' && !targets.includes(target as (typeof targets)[number]))) {
  console.error(`Uso: bun run build:binary [${targets.join(' | ')} | --all]`);
  process.exit(1);
}

const outdir = 'dist/binaries';
await mkdir(outdir, { recursive: true });
for (const selected of target === '--all' ? targets : [target]) {
  const name = `codexivo-${selected.slice(4)}${selected.includes('windows') ? '.exe' : ''}`;
  const child = Bun.spawn([
    process.execPath, 'build', './src/cli.ts', '--compile', `--target=${selected}`,
    '--minify', '--sourcemap', `--outfile=${join(outdir, name)}`,
  ], { stdout: 'inherit', stderr: 'inherit' });
  const status = await child.exited;
  if (status !== 0) process.exit(status);
  const directory = `packages/codexivo-${selected.slice(4)}/bin`;
  await mkdir(directory, { recursive: true });
  const destination = join(directory, selected.includes('windows') ? 'codexivo.exe' : 'codexivo');
  await copyFile(join(outdir, name), destination);
  await chmod(destination, 0o755);
}
