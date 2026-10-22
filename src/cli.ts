#!/usr/bin/env bun
import { formatError } from './errors';
import { prepare, Session } from './engine';
import { tokenize } from './syntax/lexer';
import { TokenType } from './syntax/token';

export const banner = `
░█████╗░░█████╗░██████╗░███████╗██╗░░██╗██╗██╗░░░██╗░█████╗░
██╔══██╗██╔══██╗██╔══██╗██╔════╝╚██╗██╔╝██║██║░░░██║██╔══██╗
██║░░╚═╝██║░░██║██║░░██║█████╗░░░╚███╔╝░██║╚██╗░██╔╝██║░░██║
██║░░██╗██║░░██║██║░░██║██╔══╝░░░██╔██╗░██║░╚████╔╝░██║░░██║
╚█████╔╝╚█████╔╝██████╔╝███████╗██╔╝╚██╗██║░░╚██╔╝░░╚█████╔╝
░╚════╝░░╚════╝░╚═════╝░╚══════╝╚═╝░░╚═╝╚═╝░░░╚═╝░░░░╚════╝░
`;

/** Líneas de la entrada estándar, una a la vez, conforme se necesitan. */
const lines = console[Symbol.asyncIterator]();
const nextLine = async (): Promise<string | null> => {
  const { value, done } = await lines.next();
  return done ? null : value;
};

/** Ejecuta un archivo: `bun run src/cli.ts programa.cdx`. Cada `leer()` toma una línea de la entrada estándar. */
const runFile = async (path: string): Promise<number> => {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    console.error(`No se encontró el archivo ${path}.`);
    return 1;
  }
  const { machine, errors } = prepare(await file.text(), { interactiveInput: true });
  for (const error of errors) console.error(formatError(error));
  if (!machine) return 1;

  let printed = 0;
  const flush = () => {
    console.write(machine.output.slice(printed));
    printed = machine.output.length;
  };
  while (machine.run() === 'esperando_entrada') {
    flush();
    const line = await nextLine();
    // Sin más entrada, `leer()` regresa `nulo`.
    if (line === null) machine.closeInput();
    else machine.provideInput(line);
  }
  flush();
  if (machine.error) console.error(formatError(machine.error));
  return machine.error ? 1 : 0;
};

const openBlocks = (source: string): number =>
  tokenize(source).tokens.reduce(
    (open, token) => open + (token.type === TokenType.LBRACE ? 1 : token.type === TokenType.RBRACE ? -1 : 0),
    0,
  );

/** REPL: cada entrada se ejecuta en la misma sesión, así las variables se conservan. */
const repl = async (): Promise<void> => {
  console.log('Bienvenido al REPL de:');
  console.log(banner);
  console.log('Escribe código Codexivo y presiona Enter. Para salir escribe `salir`.\n');

  const session = new Session();
  let source = '';
  console.write('>> ');
  for (let line = await nextLine(); line !== null; line = await nextLine()) {
    if (source === '' && ['salir', 'salir();'].includes(line.trim())) break;
    source = source === '' ? line : `${source}\n${line}`;
    // Si hay bloques abiertos, seguimos leyendo líneas hasta cerrarlos.
    if (openBlocks(source) > 0) {
      console.write('.. ');
      continue;
    }
    if (source.trim() !== '') {
      const result = session.run(source);
      console.write(result.output);
      if (result.errors.length > 0) {
        for (const error of result.errors) console.log(formatError(error));
      } else if (result.result !== null) {
        console.log(result.resultText);
      }
    }
    source = '';
    console.write('>> ');
  }
  console.log('¡Adiós!');
};

if (import.meta.main) {
  const [path] = Bun.argv.slice(2);
  if (path) process.exit(await runFile(path));
  await repl();
}
