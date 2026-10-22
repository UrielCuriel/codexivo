const { chmodSync, copyFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');

// A source checkout builds its executable later; only npm installations need this step.
if (existsSync(join(__dirname, 'src/cli.ts')) && existsSync(join(__dirname, 'packages'))) {
  process.exit(0);
}

const platform = process.platform === 'win32' ? 'windows' : process.platform;
if (!['linux', 'darwin', 'windows'].includes(platform) || !['x64', 'arm64'].includes(process.arch)) {
  console.warn(`Codexivo no tiene un ejecutable para ${platform}/${process.arch}.`);
  process.exit(0);
}

const musl = platform === 'linux' && !process.report.getReport().header.glibcVersionRuntime;
const packageName = `codexivo-${platform}-${process.arch}${musl ? '-musl' : ''}`;
const filename = platform === 'windows' ? 'codexivo.exe' : 'codexivo';
let binary;
try {
  binary = require.resolve(`${packageName}/bin/${filename}`);
} catch {
  console.error(`No se encontró ${packageName}. Reinstala Codexivo con las dependencias opcionales habilitadas.`);
  process.exit(1);
}

// One stable filename lets npm create native command links on both Windows and Unix.
// Unix can execute ELF/Mach-O files with an .exe extension too; no launcher remains.
const destination = join(__dirname, 'bin/codexivo.exe');
copyFileSync(binary, destination);
chmodSync(destination, 0o755);
