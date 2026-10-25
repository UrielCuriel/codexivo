# Arquitectura del intérprete

Codexivo convierte texto en resultados en cuatro etapas. Cada una vive en su propio módulo y se puede usar por separado; eso es
lo que permite que el sandbox muestre los tokens, el árbol y la ejecución paso a paso del mismo programa.

```
código ──tokenize──▶ tokens ──parse──▶ AST ──compile──▶ instrucciones ──Machine──▶ resultado, salida y eventos
```

## 1. Tokens y lexer (`src/syntax/token.ts`, `src/syntax/lexer.ts`)

`tokenize(código)` recorre el texto carácter por carácter y regresa `{ tokens, errors }`.

- Cada `Token` tiene su tipo, el texto exacto (`lexeme`), su valor ya interpretado (para números y textos) y su `span`: línea,
  columna y desplazamiento de inicio y fin.
- Ignora espacios y comentarios (`//` y `/* */`).
- Nunca lanza una excepción: un carácter desconocido o un texto sin cerrar se reporta en `errors` y produce un token `ILLEGAL`
  para que el parser pueda seguir.

## 2. AST y parser (`src/syntax/ast.ts`, `src/syntax/parser.ts`)

`parse(código)` regresa `{ program, tokens, errors }`.

- El AST está hecho de **objetos planos** con un campo `kind`, un `id` único y su `span`. Se puede convertir a JSON o enviar a
  un Web Worker sin perder nada. `walk` y `childrenOf` sirven para recorrerlo.
- El parser es de tipo Pratt: cada operador tiene una precedencia y el parser decide cómo agrupar comparando precedencias.
  `y`/`o` tienen menos precedencia que las comparaciones, así que `1 < 2 y 5 < 4` se agrupa como `(1 < 2) y (5 < 4)`.
- `si … pero_si … si_no` se guarda como una lista de ramas en orden, no como `si` anidados.
- Ante un error, el parser lo registra, salta hasta un punto seguro (un `;`, una `}`, una palabra que empieza sentencia o una
  línea nueva) y sigue. Así reporta varios errores en una pasada sin inventar errores en cascada.

### Traza del parser

`parse(código, { trace: true })` (o `traceParse(código)`) regresa además `trace`: los pasos con los que el parser construyó
el árbol, en orden. Con eso el sitio puede animar **cómo** se construye, no solo mostrar el resultado. Cada evento es un
objeto plano con su `span`:

| Evento       | Qué cuenta                                                                                                     |
| ------------ | -------------------------------------------------------------------------------------------------------------- |
| `consume`    | El parser toma un token: `index` en `tokens`, `tokenType` y `lexeme`.                                          |
| `enter`      | Empieza a construir un nodo (`kind`). Si lo construye a partir de uno ya hecho, `left` es el `id` de ese nodo. |
| `exit`       | Termina el nodo: `kind` e `id`, el mismo `id` que tiene en el AST.                                             |
| `precedence` | Decide de quién es un valor (ver abajo).                                                                       |
| `error`      | Un error de sintaxis, con su `code` y `message` (el mismo que está en `errors`).                               |
| `recover`    | Después de un error: qué nodos abiertos abandona y qué tokens salta para seguir.                               |

**Nodos abiertos.** Entre el `enter` y el `exit` de un nodo, el nodo está abierto esperando a sus hijos, que son los nodos
que terminan en medio. Un parser Pratt no sabe que `1` es el lado izquierdo de una suma hasta que ve el `+`: por eso el
`enter` del `Binary` llega después del `exit` del `1` y lleva `left` con su `id`; la vista mueve ese nodo dentro del nuevo.
Lo mismo pasa con las llamadas (`f` en `f(1)`), los índices, las asignaciones (`x` en `x = 1`) y las sentencias que son
una expresión.

**Precedencia.** Es la decisión central del parser. En `1 + 2 * 3`, después de leer `2` el parser está construyendo el lado
derecho del `+` y llega el `*`. El evento lleva:

- `operand`: el `id` del valor en disputa (el `2`);
- `building`: el operador que está esperando ese valor (`+`) y la precedencia con la que compara; no viene si ningún
  operador lo espera (al inicio de una expresión o dentro de un paréntesis);
- `incoming`: el operador que llegó (`*`) y su precedencia;
- `decision`: `se_lo_lleva` si `incoming` tiene más precedencia (el `2` pasa a ser el lado izquierdo del `*`) o `se_queda`
  si no (el `2` se queda como lado derecho del `+`).

En `(1 + 2) * 3` el paréntesis cierra la suma antes de que llegue el `*`: el evento del `*` no trae `building` y su
`operand` es la suma completa. En `1 < 2 y 5 < 4`, el `2` se queda con el `<` porque la `y` tiene menos precedencia. Como
`^` agrupa a la derecha, su lado derecho compara con una precedencia menos que la suya: en `2 ^ 3 ^ 2` el segundo `^` se
lleva al `3`. Las llamadas, los índices y el `.` también tienen precedencia (la más alta) y producen su evento.

**Errores.** Los nodos que estaban abiertos cuando falló la sentencia se abandonan: no tienen `exit` y no están en el AST.
`recover` los lista (`abandoned`, del más interno al más externo) junto con los tokens que saltó (`skipped.from` hasta
`skipped.to - 1`); el siguiente `consume` es el token `skipped.to`. Los errores léxicos no aparecen en la traza; el lexer
ya los reporta en `errors`.

La traza no cambia nada del análisis: sin `trace`, el parser no la construye; con ella, el AST y sus `id` son los mismos; el
mismo código produce siempre la misma traza, y los eventos se pueden mandar desde un Web Worker (en el sandbox, con la
opción `parseTrace` de `cargar`).

## 3. Compilador (`src/runtime/compiler.ts`)

`compile(program)` traduce el AST a una lista de instrucciones para una máquina de pila. Por ejemplo, `x += 1` se convierte en:

```
step      (inicio de la sentencia)
load x
const 1
binary +
store x
```

Cada instrucción guarda el nodo del AST que la originó: así la máquina sabe qué parte del código está ejecutando, y los errores
y eventos apuntan al lugar exacto.

Las decisiones (`si`, `mientras`, `hasta_que`, `para`) se compilan como `branch`: sacan la condición de la pila, revisan que
sea lógica y saltan o no. `y`/`o` usan `shortCircuit` para no evaluar el lado derecho cuando no hace falta.

## 4. Máquina (`src/runtime/machine.ts`)

`Machine` ejecuta las instrucciones con su **propia pila de valores y de llamadas**. Por eso:

- La recursión no depende de la pila de JavaScript: el límite lo pone la configuración (10 000 llamadas por defecto).
- Se puede **pausar** en cualquier momento y continuar después:
  - `run(presupuesto)` ejecuta hasta terminar o hasta gastar cierto número de operaciones. Sirve para que un Web Worker ceda el
    control y la página siga respondiendo.
  - `step()` avanza hasta la siguiente sentencia o decisión.
  - Con `breakpoints` (números de línea), `run()` se detiene antes de esas sentencias.
  - Si `leer()` no tiene entrada y `interactiveInput` está activo, la máquina queda `esperando_entrada` hasta
    `provideInput(línea)`.
- `snapshot()` regresa las llamadas activas con las variables de cada alcance, el contenido de las listas por referencia, el
  nodo actual y la salida.
- Con `onEvent`, la máquina reporta lo que hace: `paso`, `declara`, `asigna` (con el valor anterior), `decide` (con la rama
  tomada), `opera` (operandos y resultado), `llama`, `regresa`, `imprime`, `lee`, `error` y `fin`.
- Cuenta **operaciones** de forma determinista: el mismo programa con la misma entrada siempre da el mismo número.

Los valores (`src/runtime/values.ts`) son primitivos de JavaScript para números, textos, lógicos y `nulo`, y objetos con `id`
para listas y procedimientos. Los alcances (`Scope`) forman una cadena: cada bloque crea uno nuevo que apunta al de afuera.

## 5. Biblioteca (`src/runtime/builtins.ts`, `prelude.ts`, `costs.ts`)

Cada procedimiento nativo declara cuántos argumentos acepta y recibe un contexto con lo que necesita de la máquina: escribir
salida, leer entrada, crear listas y diccionarios, números aleatorios con semilla y reportar errores ubicados en la llamada.
Todo nombre con acento se registra también sin él.

### Procedimientos que reciben procedimientos

`mapear`, `filtrar`, `reducir`, `alguno`, `todos`, `buscar` y `ordenar` llaman a un procedimiento del programa. Un nativo de
JavaScript no puede hacerlo sin ejecutar la máquina dentro de sí misma, y eso rompería la pausa, el límite de llamadas, los
eventos y la cuenta de operaciones. Se consideraron tres caminos:

1. **Escribirlos en Codexivo** y compilarlos una vez. ← _elegido_
2. Instrucciones propias de la máquina (`map`, `filter`…) que empujan marcos sintéticos.
3. Que un nativo regrese una "solicitud de llamada" y la máquina lo reanude.

`src/runtime/prelude.ts` contiene su código en Codexivo. Se compila al cargar el módulo con `compileProcedure(…, hidden)`, y
todas las máquinas comparten los procedimientos resultantes (son inmutables; sus `id` son negativos). Así, cuando `mapear`
llama a `f`, es una llamada normal de la máquina: `step()` se detiene dentro de `f`, cuenta para `maxCallDepth`, emite
`llama`/`regresa` y sus operaciones se cuentan.

Su propio código es **oculto** (`Chunk.hidden`):

- no es punto de pausa ni de interrupción y no cambia el nodo actual de `snapshot()`;
- no emite eventos, salvo `llama`/`regresa` de las llamadas hacia el programa, la salida, los errores y el fin;
- no cuenta instrucciones: la llamada se cobra según la tabla de costos;
- un error ahí se ubica en la llamada del programa (`mapear(…)`), y la pila muestra `programa > mapear > f`, sin los
  procedimientos internos;
- en `snapshot()` aparece como un marco con `library: true` y sin variables.

Desde el código oculto se ven además unos nativos internos (`internals`: `revisar_lista`, `revisar_procedimiento`,
`revisar_logico`, `ordenar_natural`) que validan argumentos con los mismos mensajes que el resto de la biblioteca. El
programa no los ve. `ordenar` tiene su segundo parámetro opcional (`Chunk.minParams`).

### Costo por operación

`src/runtime/costs.ts` es la única tabla de costos (§10 de la especificación): cada llamada a un procedimiento de la
biblioteca cuesta lo que dice la tabla (`n` para los que recorren su argumento, `n · ⌈log₂ n⌉` para `ordenar`) o 1 si no
aparece. Lo que hace `f` se cuenta aparte, como cualquier código del programa. Las llamadas que hace la biblioteca a sus
propios ayudantes no se cobran otra vez.

## 6. Errores (`src/errors.ts`, `src/error-codes.ts`)

`CodexivoError` tiene `kind` (`léxico`, `sintaxis`, `análisis`, `ejecución` o `límite`), un `code` estable, `message`, `hint`, `span` y la
pila de llamadas. `formatError` lo convierte en el texto que muestran el REPL y la consola. `error-codes.ts` lista todos los
códigos con una explicación larga; una prueba revisa que no falte ni sobre ninguno.

## Análisis estático (`src/analyzer.ts`)

`analyzeProgram(programa, opciones)` recorre el AST sin ejecutarlo y regresa `diagnostics` y `symbols`; `analyze(código,
opciones)` lo junta con `parse` y `flowGraph` en una sola llamada para el editor (es lo que responde el mensaje `analizar`
del sandbox, ver [`integracion.md`](./integracion.md#análisis-mientras-se-escribe)).

- **Las mismas reglas que la máquina.** Sigue el alcance tal como lo compila `compiler.ts`: los procedimientos con nombre
  existen desde el inicio de su bloque, las variables desde su declaración (el valor se evalúa antes), cada bloque abre un
  alcance, la variable de `para … desde … hasta` y las de `para_cada` comparten alcance con el cuerpo, y el nombre de un
  dominio se declara al cerrar su bloque. Los nombres que el programa no declara se buscan en la biblioteca en el mismo
  orden que la máquina (nativos, incluidos los del mundo si se pide, prelude, constantes), y una variable propia los oculta.
- **Nunca inventa un error.** Cada diagnóstico es un error que la máquina daría al llegar a esa línea, con el mismo `code`,
  mensaje y rango: nombres que no existen (con la misma sugerencia, o la pista «se declara más abajo»), asignar a una
  variable no declarada o a un nombre de la biblioteca, cambiar una constante, la variable de un `para` o un miembro de
  solo lectura, declarar dos veces, miembros de dominio que no existen, cantidad de argumentos y llamar a algo que no es un
  procedimiento. Cuando no puede saberlo, calla: los cuerpos de los procedimientos se recorren al final, cuando los alcances
  de afuera están completos, porque un procedimiento puede usar una variable global declarada después de él; una `variable`
  que guarda un procedimiento no se revisa, porque puede cambiar. Una prueba compara el mensaje del analizador con el de la
  máquina caso por caso, y otra pasa todos los ejemplos de la documentación y del catálogo exigiendo cero diagnósticos.
- **Literales, con la máquina misma.** Una operación hecha solo de literales (`1 / 0`, `"a" - 1`, `[1, 2][5]`), una
  condición literal que no es lógica (`si (1)`) o la cabeza de un bucle con literales (`repetir "3" veces`) se evalúa con
  una `Machine` de verdad sobre esa sola sentencia, con el cuerpo vacío, y se reporta el error que dé. Así no se duplican
  las reglas de tipos del intérprete y el mensaje es idéntico.
- **Advertencias y sugerencias.** Con todos los usos contados, se avisa de lo que sobra o no cuadra, sin que sea un error:
  variables y constantes que nunca se leen (`VARIABLE_SIN_USO`, distinguiendo «se declara pero nunca se usa» de «cambia de
  valor pero nunca se lee»), parámetros (`PARÁMETRO_SIN_USO`), procedimientos y dominios que nadie usa
  (`PROCEDIMIENTO_SIN_USO`; llamarse a sí mismo no cuenta, y la opción `used` exime lo que se usa desde fuera, como el
  `resolver` de un reto), código después de `regresa`, `romper`, `continuar`, de un `si` en el que todas las ramas salen o
  de un `mientras (verdadero)` sin `romper` (`CÓDIGO_INALCANZABLE`, un aviso por bloque que abarca todas las sentencias
  muertas; los procedimientos con nombre no cuentan porque se crean al entrar al bloque) y condiciones que siempre valen lo
  mismo (`CONDICIÓN_CONSTANTE`; `mientras (verdadero)` con `romper` no avisa). La variable de un bucle sin usar es una
  `sugerencia` que propone `repetir`.
- **Código a medias.** Con errores de sintaxis el parser abandona lo que no entendió, así que una declaración o un uso
  puede faltar: con `incomplete: true` (lo pone `analyze` sola) se omiten los avisos de nombres que no existen y los de
  «sin uso», y se conservan los demás.
- **Símbolos.** Cada declaración con su `Identifier`, el nodo que abre su alcance, sus parámetros, su dominio y cada uso
  (`lectura`, `escritura`, `actualización`); todo serializable. De aquí salen los avisos de «sin uso».

## Catálogo (`src/catalog.ts`)

`catalog` exporta como datos serializables lo que el sitio necesita para el resaltado, el autocompletado, la documentación y
los avisos del editor:

- `keywords`: las palabras reservadas por grupo (declaración, control, lógicas, literales, operadores), generadas desde
  `KEYWORDS`;
- `operators`: símbolo, forma en palabras, precedencia, asociatividad y descripción;
- `library`: cada procedimiento con su nombre canónico y alias, nivel, categoría, firma, tipo que regresa, si cambia su
  argumento, descripción y ejemplos ejecutables;
- `constants`, `errors` y `exampleWorld` (el mundo con el que corren los ejemplos del modo mundo).

La documentación de cada procedimiento vive junto a su definición: `define()` en `builtins.ts` la exige, y los
procedimientos de `prelude.ts` y del modo mundo tienen la suya al lado. Las pruebas ejecutan cada ejemplo del catálogo y
revisan que cada procedimiento registrado tenga entrada y viceversa. `bun run docs:biblioteca` genera las tablas de la
biblioteca en Markdown.

## 7. API (`src/engine.ts`, `src/index.ts`)

- `run(código, opciones)` ejecuta un programa completo y regresa resultado, salida, errores, operaciones y, con `trace: true`,
  los eventos.
- `prepare(código, opciones)` analiza el código y regresa una `Machine` lista para ejecutar paso a paso, junto con los
  `diagnostics` del análisis estático (que no impiden ejecutar).
- `analyze(código, opciones)` analiza sin ejecutar: errores, diagnósticos, símbolos y diagrama de flujo.
- `Session` comparte variables entre ejecuciones; la usa el REPL.

## Diagrama de flujo (`src/flow.ts`, `src/printer.ts`)

`flowGraph(programa | procedimiento, opciones)` regresa un grafo serializable. La lógica que decide qué nodos y aristas
existen vive aquí, probada; el sitio solo calcula coordenadas (con ELK o dagre) y dibuja.

- **Nodos:** `inicio`, `fin`, `proceso`, `decisión` (`si`, `pero_si`, condiciones de bucles, `hasta_que`, `repetir`,
  `para_cada`), `llamada`, `entrada` (`leer`), `salida` (`imprimir`) y `retorno`. Cada uno trae los `astIds` y `spans` de
  los nodos del AST que representa, un texto corto (`suma += i`, `i <= 10`), un `rank` sugerido (la distancia más larga
  desde el inicio sin contar las vueltas) y una `key` estable entre versiones del código: la ruta de su sentencia en el
  árbol (`2`, `2.c.0` para la primera del cuerpo, `1.r1.3` para la cuarta de un `pero_si`, `3.i` y `3.u` para el inicio y
  la actualización de un `para`). Mientras se escribe dentro de una sentencia su nodo conserva la clave, y al insertar una
  sentencia solo cambian las que le siguen en su bloque; con ella el sitio anima el diagrama de un análisis al siguiente.
  Con errores de sintaxis el grafo muestra lo que el parser sí entendió.
- **Aristas:** `kind` (`normal`, `vuelta`, `romper`, `continuar`, `regresa`) y, al salir de una decisión, `label` (`sí`/`no`
  en condiciones, `repetir`/`salir` en `repetir` y `para_cada`). Un `si` sin `si_no` lleva por el `no` a la sentencia
  siguiente.
- **Opciones:** `group` junta sentencias simples consecutivas; `expandProcedures` agrega en `procedures` el grafo de cada
  procedimiento con nombre y marca sus llamadas con `procedure`; `maxLabelLength` recorta las etiquetas.

**Resaltar el nodo activo:** cada `nodeId` de los eventos `paso` y `decide` (y el `ownerId` de `decide`) está en los
`astIds` de un nodo del grafo, así el sitio sabe qué nodo iluminar y, con el valor de la decisión, qué arista se tomó. Una
prueba lo comprueba ejecutando programas con cada estructura de control.

`printExpression` y `printStatement` convierten nodos del AST en texto de Codexivo con los paréntesis justos; sirven para
cualquier otra vista.

## Sandbox en un Web Worker (`src/worker.ts`, `sandbox-host.ts`, `sandbox.ts`, `challenge.ts`)

`codexivo/worker` es el script del worker; `SandboxHost` tiene la lógica del protocolo sin depender de `postMessage`
(ejecución en tandas, eventos agrupados, retroceso por re-ejecución), y `createSandbox` es el cliente con promesas.
`evaluarReto` ejecuta los casos de un reto. Los detalles están en [`integracion.md`](./integracion.md).

## Para estudiar el código

1. `bun run repl` y escribe programas pequeños.
2. Lee los tests de `tests/` en el orden del pipeline: `lexer`, `parser`, `machine`, `stepping`.
3. Usa `tokenize`, `traceParse` y `run(código, { trace: true })` para ver cada etapa del mismo programa.
