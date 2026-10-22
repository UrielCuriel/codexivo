import { chmod, copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const source = Bun.argv[2] ?? 'dist/binaries';
const root = await Bun.file('packages/cli/package.json').json();
for (const name of Object.keys(root.optionalDependencies)) {
  const pkg = await Bun.file(`packages/${name}/package.json`).json();
  if (pkg.version !== root.version || root.optionalDependencies[name] !== root.version) {
    throw new Error(`La versión de ${name} debe coincidir con ${root.version}.`);
  }
  const suffix = pkg.os[0] === 'win32' ? '.exe' : '';
  const directory = `packages/${name}/bin`;
  await mkdir(directory, { recursive: true });
  const destination = join(directory, `codexivo${suffix}`);
  await copyFile(join(source, `${name}${suffix}`), destination);
  await chmod(destination, 0o755);
}
