export {};

// Publish native dependencies first; reruns can resume a partially published release.
const root = await Bun.file('packages/cli/package.json').json();
const tag = root.version.includes('-') ? 'next' : 'latest';
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
  const child = Bun.spawn(['npm', 'publish', directory, '--access', 'public', '--provenance', '--tag', tag], {
    stdout: 'inherit',
    stderr: 'inherit',
  });
  const status = await child.exited;
  if (status !== 0) process.exit(status);
}
