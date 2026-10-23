export {};

// Publish native dependencies first; reruns can resume a partially published release.
// They don't depend on each other, so they are uploaded in parallel: one by one, the eight uploads were most of the
// release time. `npm publish` (not `bun publish`) because only npm signs provenance and authenticates with OIDC.
const root = await Bun.file('packages/cli/package.json').json();
const tag = root.version.includes('-') ? 'next' : 'latest';
const pending: string[] = [];
for (const name of Object.keys(root.optionalDependencies)) {
  const directory = `./packages/${name}`;
  const pkg = await Bun.file(`${directory}/package.json`).json();
  if (pkg.version !== root.version || root.optionalDependencies[name] !== root.version) {
    throw new Error(`La versión de ${name} debe coincidir con ${root.version}.`);
  }
  const binary = `${directory}/bin/codexivo${pkg.os[0] === 'win32' ? '.exe' : ''}`;
  if (!(await Bun.file(binary).exists())) throw new Error(`Falta el ejecutable ${binary}.`);
  const response = await fetch(`https://registry.npmjs.org/${name}/${pkg.version}`);
  if (response.ok) {
    console.log(`${name}@${pkg.version} ya está publicado.`);
    continue;
  }
  if (response.status !== 404) throw new Error(`npm respondió ${response.status} para ${name}.`);
  pending.push(name);
}

const results = await Promise.all(
  pending.map(async name => {
    const child = Bun.spawn(
      ['npm', 'publish', `./packages/${name}`, '--access', 'public', '--provenance', '--tag', tag],
      {
        stdout: 'inherit',
        stderr: 'inherit',
      },
    );
    return { name, status: await child.exited };
  }),
);
const failed = results.filter(result => result.status !== 0);
for (const { name, status } of failed) console.error(`No se pudo publicar ${name} (código ${status}).`);
if (failed.length > 0) process.exit(1);
