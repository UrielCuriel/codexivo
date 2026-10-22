import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { strict as assert } from 'node:assert';

// Exercise the tarball in an isolated consumer, rather than importing repository sources.
const temporary = await mkdtemp(join(tmpdir(), 'codexivo-package-'));
const execute = async (cmd: string[], cwd = temporary, stdin?: string, env = process.env, expectedStatus = 0) => {
  const child = Bun.spawn(cmd, {
    cwd,
    env,
    stdin: stdin === undefined ? 'ignore' : new Blob([stdin]),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, status] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  assert.equal(status, expectedStatus, `${cmd.join(' ')}\n${stdout}\n${stderr}`);
  return stdout;
};

try {
  const tarball = join(temporary, 'codexivo.tgz');
  await execute([process.execPath, 'pm', 'pack', '--filename', tarball], process.cwd());
  const platform = process.platform === 'win32' ? 'windows' : process.platform;
  const report = process.report.getReport() as { header: { glibcVersionRuntime?: string } };
  const musl = platform === 'linux' && !report.header.glibcVersionRuntime;
  const nativeName = `codexivo-${platform}-${process.arch}${musl ? '-musl' : ''}`;
  const nativeTarball = join(temporary, 'native.tgz');
  await execute([process.execPath, 'pm', 'pack', '--filename', nativeTarball], resolve('packages', nativeName));
  await writeFile(join(temporary, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  // Both tarballs are unpublished: resolve the native dependency locally.
  await execute(['npm', 'install', '--offline', '--no-audit', '--no-fund', tarball, nativeTarball]);
  const installed = join(temporary, 'node_modules/codexivo');
  const pkg = await Bun.file(join(installed, 'package.json')).json();
  assert.equal(pkg.sideEffects, false);
  assert.ok(await Bun.file(join(installed, pkg.exports['.'].types)).exists());
  const executable = Bun.file(join(installed, pkg.bin.codexivo));
  const nativePath = join(
    temporary,
    'node_modules',
    nativeName,
    'bin',
    platform === 'windows' ? 'codexivo.exe' : 'codexivo',
  );
  assert.equal(executable.size, Bun.file(nativePath).size);
  assert.deepEqual(await executable.slice(0, 16).arrayBuffer(), await Bun.file(nativePath).slice(0, 16).arrayBuffer());
  assert.equal(pkg.optionalDependencies[nativeName], pkg.version);
  assert.equal(await Bun.file(join(installed, 'dist/cli.js')).exists(), false);

  await writeFile(
    join(temporary, 'consumer.ts'),
    `
    import { run } from 'codexivo';
    const result = run('imprimir("Hola desde el paquete");');
    if (!result.ok || result.output !== 'Hola desde el paquete\\n') throw new Error(JSON.stringify(result));
    console.log(result.output.trim());
  `,
  );
  await writeFile(
    join(temporary, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: { strict: true, target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler', types: [] },
      include: ['consumer.ts'],
    }),
  );
  await execute([process.execPath, 'check']);
  assert.equal((await execute(['node', '--experimental-strip-types', 'consumer.ts'])).trim(), 'Hola desde el paquete');
  await execute([process.execPath, 'build', 'consumer.ts', '--target=browser', '--outfile=browser.js']);
  // A Vite production build verifies real consumer package resolution.
  await execute(['npm', 'install', '--save-dev', '--no-audit', '--no-fund', 'vite@8.0.3']);
  await writeFile(join(temporary, 'index.html'), '<script type="module" src="/consumer.ts"></script>');
  await execute([process.execPath, 'run', 'vite', 'build']);

  await writeFile(join(temporary, 'programa.cdx'), 'imprimir(leer_número() * 2);');
  const cli = resolve(installed, pkg.bin.codexivo);
  const withoutRuntimes = { ...process.env, PATH: '', Path: '' };
  assert.equal(await execute([cli, 'programa.cdx'], temporary, '21\n', withoutRuntimes), '42\n');
  assert.match(await execute([cli], temporary, 'variable año = 2026;\naño\nsalir\n', withoutRuntimes), /2026/);
  const command = join(temporary, 'node_modules', '.bin', process.platform === 'win32' ? 'codexivo.cmd' : 'codexivo');
  const commandArgs = process.platform === 'win32' ? [process.env.ComSpec!, '/d', '/c', command] : [command];
  assert.equal(await execute([...commandArgs, 'programa.cdx'], temporary, '21\n', withoutRuntimes), '42\n');
  // Exercise the command link created by npm as well.
  assert.equal(
    await execute(['npm', 'exec', '--offline', '--', 'codexivo', 'programa.cdx'], temporary, '21\n'),
    '42\n',
  );
  await writeFile(join(temporary, 'error.cdx'), '1 / 0;');
  await execute([cli, 'error.cdx'], temporary, undefined, withoutRuntimes, 1);
  await execute([cli, 'no-existe.cdx'], temporary, undefined, withoutRuntimes, 1);
  assert.equal(await execute([cli, 'programa.cdx'], temporary, '21\n', withoutRuntimes), '42\n');
  await rm(
    join(temporary, 'node_modules', nativeName, 'bin', process.platform === 'win32' ? 'codexivo.exe' : 'codexivo'),
  );
  // The copied executable is independent of its installation sources as well as the JS runtimes.
  assert.equal(await execute([cli, 'programa.cdx'], temporary, '21\n', withoutRuntimes), '42\n');
  console.log('Paquete validado: importación, navegador/Vite, tipos y comando nativo sin Node ni Bun en PATH.');
} finally {
  await rm(temporary, { recursive: true, force: true });
}
