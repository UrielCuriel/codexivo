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

## 5. Biblioteca (`src/runtime/builtins.ts`)

Cada procedimiento nativo declara cuántos argumentos acepta y recibe un contexto con lo que necesita de la máquina: escribir
salida, leer entrada, crear listas y reportar errores ubicados en la llamada. Todo nombre con acento se registra también sin él.

## 6. Errores (`src/errors.ts`)

`CodexivoError` tiene `kind` (`léxico`, `sintaxis`, `ejecución` o `límite`), un `code` estable, `message`, `hint`, `span` y la
pila de llamadas. `formatError` lo convierte en el texto que muestran el REPL y la consola.

## 7. API (`src/engine.ts`, `src/index.ts`)

- `run(código, opciones)` ejecuta un programa completo y regresa resultado, salida, errores, operaciones y, con `trace: true`,
  los eventos.
- `prepare(código, opciones)` analiza el código y regresa una `Machine` lista para ejecutar paso a paso.
- `Session` comparte variables entre ejecuciones; la usa el REPL.

## Para estudiar el código

1. `bun run repl` y escribe programas pequeños.
2. Lee los tests de `tests/` en el orden del pipeline: `lexer`, `parser`, `machine`, `stepping`.
3. Usa `tokenize`, `parse` y `run(código, { trace: true })` para ver cada etapa del mismo programa.
