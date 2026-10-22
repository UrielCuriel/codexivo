import { chmodSync, copyFileSync, existsSync, linkSync, readFileSync, unlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Development checkouts build their executables after installing dependencies.
if (existsSync(resolve(directory, '../../src/cli.ts')) && existsSync(resolve(directory, '../../packages')))
  process.exit(0);

const root = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
const platform = process.platform === 'win32' ? 'windows' : process.platform;
const musl = platform === 'linux' && !process.report.getReport().header.glibcVersionRuntime;
const name = `codexivo-${platform}-${process.arch}${musl ? '-musl' : ''}`;

try {
  if (!root.optionalDependencies[name]) throw new Error(`No hay un ejecutable para ${platform}/${process.arch}.`);
  const manifest = require.resolve(`${name}/package.json`);
  const native = JSON.parse(readFileSync(manifest, 'utf8'));
  if (native.version !== root.version || native.version !== root.optionalDependencies[name]) {
    throw new Error(`La versión de ${name} (${native.version}) debe ser ${root.version}.`);
  }
  const source = join(dirname(manifest), 'bin', platform === 'windows' ? 'codexivo.exe' : 'codexivo');
  if (!existsSync(source)) throw new Error(`No se encontró el ejecutable de ${name}.`);
  const destination = resolve(directory, root.bin.codexivo);
  if (existsSync(destination)) unlinkSync(destination);
  try {
    linkSync(source, destination);
  } catch {
    copyFileSync(source, destination);
  }
  chmodSync(destination, 0o755);
} catch (error) {
  console.error(`No se pudo instalar Codexivo: ${error.message}`);
  console.error('Reinstala el paquete con las dependencias opcionales y los scripts de instalación habilitados.');
  process.exit(1);
}
