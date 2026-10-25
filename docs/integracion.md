# Integrar Codexivo en una página

El sandbox ejecuta el código en un **Web Worker**, así un bucle infinito nunca congela la página. Este paquete trae el
worker (`codexivo/worker`) y un cliente tipado (`createSandbox`) para no reimplementar el protocolo en cada sitio.

## Ejemplo mínimo

```ts
import { createSandbox } from 'codexivo';

const worker = new Worker(new URL('codexivo/worker', import.meta.url), { type: 'module' });
const sandbox = createSandbox(worker);

const { errors } = await sandbox.load(código, { detail: 'decisiones' });
if (errors.length > 0) mostrarErrores(errors);

sandbox.onProgress(({ output }) => consola.append(output)); // cada tanda
const stopped = await sandbox.run();
consola.append(stopped.output);

if (stopped.status === 'esperando_entrada') {
  await sandbox.provideInput(campo.value);
  await sandbox.resume();
}
```

## Mensajes

`createSandbox` traduce cada método a un mensaje (`SandboxRequest`) y resuelve la promesa con la respuesta
(`SandboxResponse`). Quien quiera hablar con el worker directamente puede mandar los mensajes; todos llevan un `id`, y la
respuesta trae el mismo.

| Método                   | Mensaje                  | Responde con | Qué hace                                                                  |
| ------------------------ | ------------------------ | ------------ | ------------------------------------------------------------------------- |
| `load(código, opciones)` | `cargar`                 | `cargado`    | Tokens, AST, errores de sintaxis y la semilla de `aleatorio`              |
| `analyze(código, opc.)`  | `analizar`               | `análisis`   | Analiza sin ejecutar: diagnósticos, símbolos y diagrama (ver abajo)       |
| `run()`                  | `ejecutar`               | `detenido`   | Ejecuta hasta terminar, sin detenerse en los puntos de interrupción       |
| `resume()`               | `continuar`              | `detenido`   | Ejecuta hasta el siguiente punto de interrupción o hasta terminar         |
| `step()`                 | `paso`                   | `detenido`   | Avanza a la siguiente sentencia o decisión                                |
| `pause()`                | `pausar`                 | `hecho`      | La ejecución en curso se detiene al terminar la tanda (`reason: 'pausa'`) |
| `goToStep(n)`            | `ir_a_paso`              | `detenido`   | Retrocede (o avanza) al paso `n`                                          |
| `provideInput(línea)`    | `entrada`                | `hecho`      | Da una línea a `leer()`; después hay que continuar                        |
| `closeInput()`           | `cerrar_entrada`         | `hecho`      | Desde ahora `leer()` regresa `nulo`                                       |
| `setBreakpoints(líneas)` | `puntos_de_interrupción` | `hecho`      | Cambia los puntos de interrupción                                         |
| `evaluarReto(código, r)` | `evaluar_reto`           | `reto`       | Evalúa un reto (ver abajo)                                                |

Si una orden no se puede atender (no hay programa cargado, o la ejecución sigue en curso), la respuesta es `error` y la
promesa se rechaza.

`detenido` trae `status`, `reason` (`paso`, `punto_de_interrupción`, `pausa`, `entrada`, `fin`, `error` o `retroceso`),
`operations`, `steps`, la salida nueva, los eventos de la tanda, la fotografía (`snapshot`) y, según el caso, `result` o
`error`.

### Opciones de `cargar`

| Opción                                       | Por defecto    | Qué hace                                                                                    |
| -------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------- |
| `input`                                      | `[]`           | Entrada inicial                                                                             |
| `interactiveInput`                           | `true`         | `leer()` sin entrada detiene la ejecución con `esperando_entrada`                           |
| `seed`                                       | una al azar    | Semilla de `aleatorio`; se conserva en los retrocesos                                       |
| `maxOperations`, `maxCallDepth`, `maxOutput` | los de siempre | Límites                                                                                     |
| `breakpoints`                                | `[]`           | Líneas donde se detiene `continuar`                                                         |
| `world`                                      | —              | Un mundo del [modo mundo](./modo-mundo.md), en JSON                                         |
| `detail`                                     | `decisiones`   | Eventos por tanda: `nada`, `pasos` (`paso` y `robot`), `decisiones` (más `decide`) o `todo` |
| `batchSize`                                  | 50 000         | Operaciones por tanda                                                                       |
| `parseTrace`                                 | `false`        | `cargado` trae `parseTrace`: la [traza del parser](./arquitectura.md#traza-del-parser)      |

## Análisis mientras se escribe

`analyze(código, opciones)` (mensaje `analizar`) hace en una sola pasada todo lo que un editor necesita para cada versión
del código, sin ejecutarlo ni tocar el programa cargado: se puede mandar en cada cambio (con un _debounce_ del lado de la
página) y también mientras una ejecución sigue en curso. La respuesta `análisis` trae:

- `tokens`, `program` y `errors`, como `cargado`. Con errores de sintaxis el AST es **parcial**: el parser abandona lo que
  no entendió y sigue, así que el diagrama y los símbolos muestran lo que sí se entendió.
- `diagnostics`: lo que el [análisis estático](./arquitectura.md#análisis-estático-srcanalyzerts) encontró, con
  `kind: 'análisis'`, `code`, `message`, `hint`, `span` y una `severity`:
  - `error`: lo que la máquina rechazaría al llegar a esa línea (nombres que no existen, constantes reasignadas, cantidad
    de argumentos, `1 / 0`, `si (1)`…), con el mismo código y mensaje que daría al ejecutar;
  - `advertencia`: el programa corre, pero algo sobra o no cuadra (`VARIABLE_SIN_USO`, `PARÁMETRO_SIN_USO`,
    `PROCEDIMIENTO_SIN_USO`, `CÓDIGO_INALCANZABLE`, `CONDICIÓN_CONSTANTE`);
  - `sugerencia`: una forma más clara de escribir lo mismo (la variable de un `para` que no se usa: `repetir n veces`).

  Con errores de sintaxis se omiten los avisos de nombres que no existen y los de «sin uso», porque la declaración o el uso
  pudieron quedar en la parte abandonada.

- `symbols`: cada nombre que declara el programa (`variable`, `constante`, `procedimiento`, `parámetro`, `dominio`), el
  `Identifier` que lo declara, el nodo que abre el alcance donde se ve, sus parámetros si es un procedimiento, el dominio
  al que pertenece y cada uso (`lectura`, `escritura` o `actualización`) con su `span`. Sirve para resaltar los usos de
  una variable, ir a su declaración y autocompletar.
- `flow`: el [diagrama de flujo](./arquitectura.md#diagrama-de-flujo-srcflowts-srcprinterts), ya calculado. Cada nodo
  trae una `key` estable entre versiones del código (la ruta de su sentencia, como `2.c.0`), para animar el diagrama de un
  análisis al siguiente en lugar de dibujarlo de cero.

Las opciones son `world` (`true` o el mundo, para que existan `avanzar()` y los demás procedimientos del robot), `natives`
(nativos adicionales), `globals` (variables que existen fuera del programa), `allowRedeclare`, `used` (nombres que se usan
desde fuera y no deben avisar «sin uso»: `['resolver']` en un reto estilo `regresa`) y `flow` (las opciones de
`flowGraph`, o `false` para no generarlo). Si la página manda varios `analizar` seguidos, basta con quedarse con la
respuesta del `id` más reciente.

```ts
editor.onChange(
  debounce(async código => {
    const { errors, diagnostics, symbols, flow } = await sandbox.analyze(código, { flow: { group: true } });
    subrayar([...errors, ...diagnostics]);
    dibujarDiagrama(flow);
  }, 150),
);
```

`prepare(código, opciones)` y, a través de ella, `run` también calculan `diagnostics`, sin impedir la ejecución: la máquina
da el mismo error al llegar a esa línea.

## Tandas

`run()` y `resume()` ejecutan en tandas de `batchSize` operaciones. Entre una y otra, el worker manda un `progreso`
(operaciones, pasos, salida nueva y eventos) y cede el control con `setTimeout(0)`; así puede recibir un `pausar`. Los
eventos llegan agrupados por tanda para no saturar `postMessage`.

## Retroceso

La máquina es determinista: el mismo programa con la misma entrada y la misma semilla da exactamente lo mismo. Por eso
retroceder no guarda estados: `goToStep(n)` vuelve a ejecutar desde el inicio, con la entrada que se ha dado y la misma
semilla, hasta el paso `n`, sin emitir los eventos intermedios. El `detenido` trae `replaceOutput: true` y toda la salida
hasta ese paso, y la fotografía es idéntica a la que había al pasar por ahí.

Un **paso** es un punto de pausa: cada `step()` avanza exactamente uno, y `steps` cuenta cuántos lleva la ejecución.

## Retos

`evaluarReto(código, reto)` ejecuta cada caso con su entrada y su límite de operaciones. Funciona en el worker y también
directamente en Bun (`import { evaluarReto } from 'codexivo'`), así los retos del sitio se prueban en CI.

```ts
// Estilo HackerRank: se compara lo que imprime.
evaluarReto(código, {
  style: 'salida',
  cases: [{ input: '3', expectedOutput: '9' }],
});

// Estilo LeetCode: se llama a `resolver(…)` y se compara lo que regresa, por valor.
evaluarReto(código, {
  style: 'regresa',
  maxOperations: 100_000,
  cases: [{ args: [[2, 7, 11, 15], 9], expected: [0, 1] }],
});
```

Los argumentos y el valor esperado son JSON: los arreglos se vuelven listas y los objetos, diccionarios. En el estilo
`salida` se ignoran los espacios al final de cada línea y las líneas vacías del final, salvo con `exactOutput: true`. Cada
caso regresa si pasó, la salida, lo que regresó y lo esperado (como se escribirían en código), las operaciones y el error,
si hubo.
