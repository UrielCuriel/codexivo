# Arquitectura interna del intérprete

Este documento explica cómo está implementado Codexivo para que estudiantes y contribuyentes entiendan el flujo completo desde
el texto fuente hasta la ejecución. Sigue el orden real en el que intervienen los módulos de `src/`.

## 1. Motor de orquestación (`src/engine.ts`)

`CodexivoEngine` centraliza las operaciones de parseo, generación de AST, ejecución y trazado. Expone tres métodos principales:

- `parse` crea un `Lexer`, un `Parser` y devuelve el `Program` junto con los errores sintácticos acumulados.
- `getAST` serializa el programa para herramientas de visualización usando `astSerializer.ts`.
- `run` reutiliza `parse`, configura el entorno y delega en el evaluador; opcionalmente activa un `RuntimeTracer` para capturar el
  recorrido. 【F:src/engine.ts†L1-L83】

Comprender este motor te permite construir interfaces (REPL, web) sobre una API consistente.

## 2. Análisis léxico (`src/lexer.ts`)

El `Lexer` recorre el código carácter a carácter y produce instancias de `Token`. Mantiene punteros de posición, línea y columna
para enriquecer los mensajes de error. Entre sus responsabilidades destacan:

- Ignorar espacios en blanco y saltos de línea (`skipWhitespace`).
- Reconocer operadores de uno y dos caracteres (`makeTwoCharacterToken`).
- Leer identificadores/keywords, números (enteros y decimales) y cadenas con comillas simples o dobles. 【F:src/lexer.ts†L1-L117】

El mapeo de palabras reservadas se realiza con `lookupIdentifier` en `token.ts`. Si el literal no coincide, se clasifica como
identificador genérico. 【F:src/token.ts†L44-L77】

## 3. Árbol de sintaxis abstracta (`src/ast.ts`)

Cada nodo del AST extiende las clases base `Statement` o `Expression`. Se guardan el token de origen, línea y columna para poder
serializar y depurar. Algunos nodos clave:

- `Program`: raíz que agrupa todas las sentencias.
- `LetStatement`, `ReturnStatement`, `ExpressionStatement`: representan las instrucciones de alto nivel.
- `If`, `While`, `DoWhile`, `For`: encapsulan estructuras de control.
- `Function` y `Call`: modelan procedimientos y sus invocaciones.
- `StringLiteral`, `Boolean`, `Number`: literales primitivos. 【F:src/ast.ts†L1-L229】

Estudiar estas clases es útil para añadir nuevas construcciones sin romper la serialización o el trazado.

## 4. Análisis sintáctico (`src/parser.ts`)

El parser implementa la técnica Pratt para resolver la precedencia de operadores. Mantiene un mapa de funciones de parseo por
token (`registerPrefixParseFns` y `registerInfixParseFns`) y avanza en el flujo de tokens con `advanceTokens`.

- `parseProgram` recorre los tokens hasta `EOF` y va agregando sentencias.
- `parseLetStatement`, `parseReturnStatement` y `parseExpressionStatement` manejan las estructuras básicas.
- `parseIf`, `parseFunction`, `parseCall`, `parseArray` y `parseIndexExpression` amplían las expresiones posibles.
- Cuando se detecta una palabra reservada mal usada o falta un token esperado se agrega un mensaje legible al arreglo `_errors`.
  【F:src/parser.ts†L1-L680】

La modularidad facilita que cambies o amplíes la gramática simplemente registrando nuevas funciones.

## 5. Objetos en tiempo de ejecución (`src/object.ts`)

Los resultados de evaluar nodos del AST se representan con clases que implementan `Object`:

- `Number`, `Boolean`, `String`, `Null` encapsulan tipos primitivos.
- `Environment` es un mapa jerárquico que conserva valores y permite alcance léxico mediante una referencia `outer`.
- `Function` guarda parámetros, cuerpo y el entorno donde se definió (clausuras).
- `Builtin` envuelve funciones nativas escritas en TypeScript.
- `Return` y `Error` permiten controlar el flujo interno del evaluador. 【F:src/object.ts†L1-L111】

Dominar estas clases es crucial para agregar nuevas estructuras (por ejemplo, arreglos) sin reescribir el evaluador.

## 6. Evaluación (`src/evaluator.ts`)

`createEvaluator` devuelve un objeto con el método `evaluate` que aplica un `switch` implícito mediante `instanceof` sobre cada
nodo del AST. El evaluador:

- Recorre el programa sentencia por sentencia y propaga valores de retorno o errores.
- Convierte literales en objetos de tiempo de ejecución (`NumberObj`, `StringObj`, etc.).
- Maneja expresiones prefijas e infijas reutilizando funciones auxiliares (`evaluatePrefixExpression`, `evaluateInfixExpression`).
- Resuelve identificadores consultando el `Environment` y, si falla, busca en los built-ins.
- Crea entornos extendidos para ejecutar procedimientos y desenvuelve resultados con `unwrapReturnValue`.
- Genera eventos para el `RuntimeTracer` cuando está activo, incluyendo cambios de variables. 【F:src/evaluator.ts†L1-L352】【F:src/evaluator.ts†L352-L462】

Actualmente los nodos de bucle aún no tienen semántica evaluada; la infraestructura está lista para incorporarla en futuras
iteraciones.

## 7. Errores y mensajes (`src/errors.ts`)

Los errores se centralizan en `newError`, que arma textos amigables en español indicando el tipo de problema, la posición y los
datos relevantes (operadores, nombres, etc.). Esto ayuda a mantener consistencia en toda la experiencia del estudiante.
【F:src/errors.ts†L1-L200】

## 8. Funciones built-in (`src/builtins.ts`)

Cada built-in es una función TypeScript que recibe y devuelve objetos de `object.ts`. Se registran en un diccionario para que el
evaluador los exponga automáticamente al usuario sin redeclararlos. Por ahora solo existe `longitud`, validada tanto en número
como en tipo de argumentos. 【F:src/builtins.ts†L1-L16】

## 9. Trazado en tiempo real (`src/runtime/tracer.ts`)

`RuntimeTracer` captura cada paso del evaluador: el nodo visitado, el estado del entorno, la pila de llamadas y eventos de E/S.
Se puede activar en modo paso a paso o con puntos de interrupción personalizados. Esta herramienta es clave para aprender cómo se
modifican las variables y entender el flujo de ejecución. 【F:src/runtime/tracer.ts†L1-L173】

## Cómo estudiar el código

1. Ejecuta `bun run repl` e ingresa programas simples.
2. Usa `CodexivoEngine.getAST` para observar cómo el parser traduce tu código.
3. Activa el tracer (`engine.run(source, { trace: true })`) y revisa los eventos generados.
4. Experimenta modificando módulos individuales y ejecuta `bun test` para validar que el comportamiento siga siendo el esperado.

Seguir estos pasos te permitirá avanzar desde escribir programas hasta comprender y extender el propio lenguaje Codexivo.
