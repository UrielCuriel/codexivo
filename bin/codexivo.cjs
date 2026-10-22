#!/usr/bin/env node
const { spawnSync } = require('node:child_process');

const platform = process.platform === 'win32' ? 'windows' : process.platform;
const supported = ['linux', 'darwin', 'windows'].includes(platform) && ['x64', 'arm64'].includes(process.arch);
if (!supported) {
  console.error(`Codexivo no tiene un ejecutable para ${platform}/${process.arch}.`);
  process.exit(1);
}

const musl = platform === 'linux' && !process.report.getReport().header.glibcVersionRuntime;
const packageName = `codexivo-${platform}-${process.arch}${musl ? '-musl' : ''}`;
const filename = platform === 'windows' ? 'codexivo.exe' : 'codexivo';
let binary;
try {
  binary = require.resolve(`${packageName}/bin/${filename}`);
} catch {
  console.error(
    `No se encontró el ejecutable ${packageName}. Reinstala Codexivo con las dependencias opcionales habilitadas.`,
  );
  process.exit(1);
}

const result = spawnSync(binary, process.argv.slice(2), { stdio: 'inherit' });
if (result.error) {
  console.error(`No se pudo iniciar Codexivo: ${result.error.message}`);
  process.exit(1);
}
if (result.signal) process.kill(process.pid, result.signal);
else process.exit(result.status ?? 1);
