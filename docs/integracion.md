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
