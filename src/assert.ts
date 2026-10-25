/**
 * Comprobación de exhaustividad. Se pone en el `default` de cada `switch` sobre `node.kind` o `instruction.op`: si
 * alguien agrega un tipo de nodo o una instrucción y olvida su caso, TypeScript rechaza la compilación (el valor ya no
 * es `never`) y, si aun así llega a ejecutarse, falla con un error interno claro en lugar de seguir en silencio. Es lo
 * que le faltó al evaluador de 2023, que ignoró los bucles durante dos años sin que nadie se enterara.
 *
 * No es un error de quien aprende, así que no es un `CodexivoError`: es un error del intérprete.
 */
export const assertNever = (value: never, what: string): never => {
  const label = typeof value === 'object' && value !== null ? JSON.stringify(value).slice(0, 80) : String(value);
  throw new Error(`Error interno de Codexivo: ${what} sin caso: ${label}`);
};
