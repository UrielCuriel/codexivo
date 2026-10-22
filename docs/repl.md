# REPL y ejecución desde la terminal

El comando npm `codexivo` requiere Bun 1.4.4 o posterior; después de instalar el paquete globalmente, ejecuta `codexivo` para
abrir el REPL o `codexivo programa.cdx` para ejecutar un archivo. Los ejecutables de
[Releases](https://github.com/UrielCuriel/codexivo/releases) incluyen el runtime y no requieren instalación de Bun.
En Linux/macOS, aplica `chmod +x` al ejecutable descargado. Se admiten x64 y ARM64 en Linux, macOS y Windows; para Alpine
Linux elige la variante `musl`.

## REPL

```sh
bun install
bun run repl
```

Escribe código y presiona Enter. Las variables se conservan entre entradas. Si una línea deja un bloque `{` abierto, el REPL
sigue leyendo (con el prompt `..`) hasta que lo cierres. Para salir escribe `salir`.

```
>> variable saludar = procedimiento(nombre) { regresa "Hola, " + nombre; };
>> saludar("Codexivo")
"Hola, Codexivo"
>> si (verdadero) {
..   imprimir("dentro del bloque")
.. }
dentro del bloque
>> salir
¡Adiós!
```

En el REPL se puede volver a declarar una variable (`variable x = …` dos veces) para experimentar; en un programa normal es un
error.

## Ejecutar un archivo

```sh
bun run src/cli.ts programa.cdx
```

Lo que llegue por la entrada estándar alimenta a `leer()` y `leer_número()`:

```sh
echo 21 | bun run src/cli.ts doble.cdx
```

## Ver la ejecución desde código

```ts
import { prepare, run } from 'codexivo';

// Todos los eventos de una ejecución
const { events } = run('variable x = 1; x += 1;', { trace: true });

// Paso a paso
const { machine } = prepare('variable x = 1;\nx += 1;');
while (machine && !machine.done) {
  machine.step();
  console.log(machine.snapshot().span?.start.line, machine.snapshot().frames[0]?.scopes);
}
```
