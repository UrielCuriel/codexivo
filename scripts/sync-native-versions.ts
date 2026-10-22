export {};

const root = await Bun.file('package.json').json();
const cli = await Bun.file('packages/cli/package.json').json();
cli.version = root.version;
for (const name of Object.keys(cli.optionalDependencies)) {
  const path = `packages/${name}/package.json`;
  const pkg = await Bun.file(path).json();
  pkg.version = root.version;
  cli.optionalDependencies[name] = root.version;
  await Bun.write(path, `${JSON.stringify(pkg, null, 2)}\n`);
}
await Bun.write('packages/cli/package.json', `${JSON.stringify(cli, null, 2)}\n`);
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
