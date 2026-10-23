# Guía práctica: entender Codexivo desde su código

Actividades para mirar debajo del capó: cada una toma el mismo programa y lo observa en una etapa distinta del intérprete. Lee
antes la [arquitectura](./arquitectura.md).

## Programa semilla

```codexivo
variable saludo = "Codexivo";
variable arma_mensaje = procedimiento(nombre) {
  variable prefijo = "Hola, ";
  regresa prefijo + nombre;
};
arma_mensaje(saludo);
```

Guárdalo en `semilla.cdx` y ejecútalo con `bun run src/cli.ts semilla.cdx`, o pégalo en el REPL.

## 1. Tokens

```ts
import { readFileSync } from 'node:fs';
import { tokenize } from './src';

const { tokens } = tokenize(readFileSync('semilla.cdx', 'utf8'));
console.table(
  tokens.map(t => ({ tipo: t.type, texto: t.lexeme, línea: t.span.start.line, columna: t.span.start.column })),
);
```

- Ubica en `src/syntax/lexer.ts` dónde se reconocen los nombres y cómo se decide si son palabras reservadas (`KEYWORDS` en
  `src/syntax/token.ts`).
- **Ejercicio:** agrega `#` al programa y observa el error léxico y su posición.

## 2. Árbol

```ts
import { parse, walk } from './src';

const { program } = parse(codigo);
walk(program, (nodo, padre) => console.log(`${padre?.kind ?? '—'} → ${nodo.kind}`));
```

- En `src/syntax/parser.ts`, busca la tabla `INFIX_PRECEDENCE` y explica por qué `1 + 2 * 3` se agrupa como `1 + (2 * 3)`.
- **Ejercicio:** escribe `1 < x < 5` y lee el error. ¿Por qué el lenguaje prefiere no encadenar comparaciones?

## 3. Instrucciones

```ts
import { compile, parse } from './src';

const chunk = compile(parse(codigo).program);
console.log(chunk.code.map(i => i.op).join(' '));
```

- Encuentra la instrucción `closure`: guarda el código del procedimiento junto con el alcance donde se creó.
- **Ejercicio:** compila `si (a) { } si_no { }` y dibuja a dónde salta cada `branch` y `jump`.

## 4. Ejecución paso a paso

```ts
import { prepare } from './src';

const { machine } = prepare(codigo);
while (machine && !machine.done) {
  machine.step();
  const foto = machine.snapshot();
  console.log(
    foto.span?.start.line,
    foto.frames.map(f => f.name).join(' > '),
    JSON.stringify(foto.frames.at(-1)?.scopes),
  );
}
```

- Observa cómo aparece el marco `arma_mensaje` mientras se ejecuta el procedimiento, con `nombre` y `prefijo`.
- **Ejercicio:** cambia el programa para que `arma_mensaje` se llame a sí mismo sin caso base. ¿Qué error aparece y por qué no
  truena JavaScript?

## 5. La biblioteca

- Lee cómo está definido `longitud` en `src/runtime/builtins.ts`: declara cuántos argumentos acepta y valida sus tipos.
- **Ejercicio:** agrega `mayúsculas(texto)` con su test en `tests/builtins.test.ts`. Comprueba que `mayusculas` también
  funcione sin acento.

## Autoevaluación

- [ ] Puedo explicar qué hace cada etapa: tokens, árbol, instrucciones, máquina.
- [ ] Sé dónde se decide la precedencia de un operador.
- [ ] Puedo leer una fotografía de la máquina e identificar en qué paso cambió una variable.
- [ ] Sé agregar un procedimiento a la biblioteca y probarlo.
