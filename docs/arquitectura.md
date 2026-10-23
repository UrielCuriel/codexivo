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

`CodexivoError` tiene `kind` (`léxico`, `sintaxis`, `ejecución` o `límite`), un `code` estable, `message`, `hint`, `span` y la
pila de llamadas. `formatError` lo convierte en el texto que muestran el REPL y la consola. `error-codes.ts` lista todos los
códigos con una explicación larga; una prueba revisa que no falte ni sobre ninguno.

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
- `prepare(código, opciones)` analiza el código y regresa una `Machine` lista para ejecutar paso a paso.
- `Session` comparte variables entre ejecuciones; la usa el REPL.

## Diagrama de flujo (`src/flow.ts`, `src/printer.ts`)

`flowGraph(programa | procedimiento, opciones)` regresa un grafo serializable. La lógica que decide qué nodos y aristas
existen vive aquí, probada; el sitio solo calcula coordenadas (con ELK o dagre) y dibuja.

- **Nodos:** `inicio`, `fin`, `proceso`, `decisión` (`si`, `pero_si`, condiciones de bucles, `hasta_que`, `repetir`,
  `para_cada`), `llamada`, `entrada` (`leer`), `salida` (`imprimir`) y `retorno`. Cada uno trae los `astIds` y `spans` de
  los nodos del AST que representa, un texto corto (`suma += i`, `i <= 10`) y un `rank` sugerido: la distancia más larga
  desde el inicio sin contar las vueltas.
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

## Para estudiar el código

1. `bun run repl` y escribe programas pequeños.
2. Lee los tests de `tests/` en el orden del pipeline: `lexer`, `parser`, `machine`, `stepping`.
3. Usa `tokenize`, `parse` y `run(código, { trace: true })` para ver cada etapa del mismo programa.
