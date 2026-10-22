import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { strict as assert } from 'node:assert';

// Exercise the tarball in an isolated consumer, rather than importing repository sources.
const temporary = await realpath(await mkdtemp(join(tmpdir(), 'codexivo-package-')));
let registry: Bun.Server<undefined> | undefined;
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
  await execute(['npm', 'install', '--save-dev', '--no-audit', '--no-fund', 'vite@8.0.3']);
  // Serve the real tarballs locally so only the main package is a direct dependency.
  // This catches missing transitive bin links, which installing both packages directly would hide.
  const root = await Bun.file('package.json').json();
  const manifests = new Map<string, Record<string, unknown>>([['codexivo', root]]);
  for (const name of Object.keys(root.optionalDependencies)) {
    manifests.set(name, await Bun.file(`packages/${name}/package.json`).json());
  }
  const downloads = new Set<string>();
  registry = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      const name = decodeURIComponent(url.pathname.slice(1).replace(/\.tgz$/, ''));
      const manifest = manifests.get(name);
      if (!manifest) return new Response('No encontrado', { status: 404 });
      if (url.pathname.endsWith('.tgz')) {
        downloads.add(name);
        if (name !== 'codexivo' && name !== nativeName) return new Response('Destino incorrecto', { status: 404 });
        return new Response(Bun.file(name === 'codexivo' ? tarball : nativeTarball));
      }
      return Response.json({
        name,
        'dist-tags': { latest: root.version },
        versions: {
          [root.version]: { ...manifest, dist: { tarball: `${url.origin}/${name}.tgz` } },
        },
      });
    },
  });
  const registryURL = `http://127.0.0.1:${registry.port}`;
  await execute(['npm', 'install', '--no-audit', '--no-fund', '--registry', registryURL, `codexivo@${root.version}`]);
  assert.deepEqual([...downloads].sort(), ['codexivo', nativeName].sort());
  const installed = join(temporary, 'node_modules/codexivo');
  const pkg = await Bun.file(join(installed, 'package.json')).json();
  assert.equal(pkg.sideEffects, false);
  assert.ok(await Bun.file(join(installed, pkg.exports['.'].types)).exists());
  assert.equal(pkg.bin.codexivo, './bin/codexivo.exe');
  assert.equal(pkg.scripts.postinstall, 'node ./postinstall.mjs');
  const native = join(temporary, 'node_modules', nativeName);
  const nativePackage = await Bun.file(join(native, 'package.json')).json();
  assert.equal(nativePackage.bin, undefined);
  const nativePath = join(native, 'bin', platform === 'windows' ? 'codexivo.exe' : 'codexivo');
  const installedBinary = Bun.file(resolve(installed, pkg.bin.codexivo));
  assert.equal(installedBinary.size, Bun.file(nativePath).size);
  assert.deepEqual(
    await installedBinary.slice(0, 16).arrayBuffer(),
    await Bun.file(nativePath).slice(0, 16).arrayBuffer(),
  );
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
  await writeFile(join(temporary, 'index.html'), '<script type="module" src="/consumer.ts"></script>');
  await execute([process.execPath, 'run', 'vite', 'build']);

  await writeFile(join(temporary, 'programa.cdx'), 'imprimir(leer_número() * 2);');
  const cli = resolve(installed, pkg.bin.codexivo);
  const withoutRuntimes = { ...process.env, PATH: '', Path: '' };
  // Refuse stale optional dependencies instead of installing the wrong release.
  const nativeManifest = join(native, 'package.json');
  await Bun.write(nativeManifest, JSON.stringify({ ...nativePackage, version: '0.0.0' }));
  await execute([Bun.which('node')!, join(installed, 'postinstall.mjs')], temporary, undefined, process.env, 1);
  await Bun.write(nativeManifest, JSON.stringify(nativePackage));
  await execute([Bun.which('node')!, join(installed, 'postinstall.mjs')]);
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
  const globalPrefix = join(temporary, 'npm-global');
  const globalCommand =
    process.platform === 'win32' ? join(globalPrefix, 'codexivo.cmd') : join(globalPrefix, 'bin/codexivo');
  await execute([
    'npm',
    'install',
    '--global',
    '--prefix',
    globalPrefix,
    '--no-audit',
    '--no-fund',
    '--registry',
    registryURL,
    `codexivo@${root.version}`,
  ]);
  const globalArgs = process.platform === 'win32' ? [process.env.ComSpec!, '/d', '/c', globalCommand] : [globalCommand];
  assert.equal(await execute([...globalArgs, 'programa.cdx'], temporary, '21\n', withoutRuntimes), '42\n');
  const bunConsumer = join(temporary, 'bun-consumer');
  await mkdir(bunConsumer);
  await writeFile(join(bunConsumer, 'package.json'), JSON.stringify({ private: true }));
  await execute(
    [process.execPath, 'add', '--trust', '--registry', registryURL, `codexivo@${root.version}`],
    bunConsumer,
  );
  const bunLocal = join(bunConsumer, 'node_modules/.bin', process.platform === 'win32' ? 'codexivo.exe' : 'codexivo');
  assert.equal(await execute([bunLocal, join(temporary, 'programa.cdx')], temporary, '21\n', withoutRuntimes), '42\n');
  const bunGlobal = join(temporary, 'bun-global');
  const bunBin = join(temporary, 'bun-bin');
  const bunEnvironment = {
    ...process.env,
    BUN_INSTALL_GLOBAL_DIR: bunGlobal,
    BUN_INSTALL_BIN: bunBin,
    BUN_INSTALL_CACHE_DIR: join(temporary, 'bun-cache'),
  };
  assert.equal(
    (await execute([process.execPath, 'pm', 'bin', '--global'], temporary, undefined, bunEnvironment)).trim(),
    bunBin,
  );
  await execute(
    [process.execPath, 'add', '--global', '--trust', '--registry', registryURL, `codexivo@${root.version}`],
    temporary,
    undefined,
    bunEnvironment,
  );
  const bunGlobalCommand = join(bunBin, process.platform === 'win32' ? 'codexivo.exe' : 'codexivo');
  assert.equal(await execute([bunGlobalCommand, 'programa.cdx'], temporary, '21\n', withoutRuntimes), '42\n');
  console.log('Paquete validado: importación, navegador/Vite, tipos y comando nativo sin Node ni Bun en PATH.');
} finally {
  registry?.stop(true);
  await rm(temporary, { recursive: true, force: true });
}
