import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { strict as assert } from 'node:assert';

// Exercise the tarball in an isolated consumer, rather than importing repository sources.
const temporary = await mkdtemp(join(tmpdir(), 'codexivo-package-'));
const execute = async (cmd: string[], cwd = temporary, stdin?: string) => {
  const child = Bun.spawn(cmd, { cwd, stdin: stdin === undefined ? 'ignore' : new Blob([stdin]), stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, status] = await Promise.all([
    new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
  ]);
  assert.equal(status, 0, `${cmd.join(' ')}\n${stdout}\n${stderr}`);
  return stdout;
};

try {
  const tarball = join(temporary, 'codexivo.tgz');
  await execute([process.execPath, 'pm', 'pack', '--filename', tarball], process.cwd());
  await writeFile(join(temporary, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  await execute([process.execPath, 'add', tarball]);
  const installed = join(temporary, 'node_modules/codexivo');
  const pkg = await Bun.file(join(installed, 'package.json')).json();
  assert.equal(pkg.sideEffects, false);
  assert.ok(await Bun.file(join(installed, pkg.exports['.'].types)).exists());
  assert.match(await Bun.file(join(installed, pkg.bin.codexivo)).text(), /^#!\/usr\/bin\/env bun\n/);

  await writeFile(join(temporary, 'consumer.ts'), `
    import { run } from 'codexivo';
    const result = run('imprimir("Hola desde el paquete");');
    if (!result.ok || result.output !== 'Hola desde el paquete\\n') throw new Error(JSON.stringify(result));
    console.log(result.output.trim());
  `);
  await writeFile(join(temporary, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { strict: true, target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler', types: [] },
    include: ['consumer.ts'],
  }));
  await execute([process.execPath, 'check']);
  assert.equal((await execute(['node', '--experimental-strip-types', 'consumer.ts'])).trim(), 'Hola desde el paquete');
  await execute([process.execPath, 'build', 'consumer.ts', '--target=browser', '--outfile=browser.js']);
  // A Vite production build verifies real consumer package resolution.
  await execute([process.execPath, 'add', '--dev', 'vite@8.0.3']);
  await writeFile(join(temporary, 'index.html'), '<script type="module" src="/consumer.ts"></script>');
  await execute([process.execPath, 'run', 'vite', 'build']);

  await writeFile(join(temporary, 'programa.cdx'), 'imprimir(leer_número() * 2);');
  const cli = resolve(installed, pkg.bin.codexivo);
  assert.equal(await execute([process.execPath, 'run', 'codexivo', 'programa.cdx'], temporary, '21\n'), '42\n');
  assert.match(await execute([process.execPath, cli], temporary, 'variable año = 2026;\naño\nsalir\n'), /2026/);
  console.log('Paquete validado: importación, navegador/Vite, tipos y CLI.');
} finally {
  await rm(temporary, { recursive: true, force: true });
}
