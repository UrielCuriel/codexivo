export {};

const root = await Bun.file('package.json').json();
for (const name of Object.keys(root.optionalDependencies)) {
  const path = `packages/${name}/package.json`;
  const pkg = await Bun.file(path).json();
  pkg.version = root.version;
  root.optionalDependencies[name] = root.version;
  await Bun.write(path, `${JSON.stringify(pkg, null, 2)}\n`);
}
await Bun.write('package.json', `${JSON.stringify(root, null, 2)}\n`);
const format = Bun.spawn([process.execPath, 'fmt', 'package.json', 'packages'], {
  stdout: 'inherit',
  stderr: 'inherit',
});
const formatStatus = await format.exited;
if (formatStatus !== 0) process.exit(formatStatus);
const install = Bun.spawn([process.execPath, 'install', '--lockfile-only', '--ignore-scripts'], {
  stdout: 'inherit',
  stderr: 'inherit',
});
process.exit(await install.exited);
