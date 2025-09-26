# Guía práctica: entender Codexivo desde su código

Esta guía acompaña a estudiantes curiosos que ya escriben programas en Codexivo y ahora desean mirar "debajo del capó" para
comprender cómo el intérprete procesa cada instrucción. Sigue los pasos en orden; cada apartado parte de un fragmento de código
real y te señala exactamente qué archivos explorar para conectar la teoría con la implementación.

## Objetivo

- Relacionar cada fase del intérprete (léxico, sintaxis, evaluación) con el código real.
- Dominar las herramientas disponibles para inspeccionar tokens, AST y el estado del entorno.
- Proponer ejercicios concretos que consoliden el aprendizaje mientras modificas o amplías el lenguaje.

## Preparación rápida

1. Instala las dependencias con `bun install`.
2. Ejecuta `bun run repl` para confirmar que el intérprete funciona.
3. Abre este repositorio en tu editor favorito; mantén a mano los archivos de `src/` y los tests de `src/tests/`.

Cuando quieras verificar que tus cambios no rompen nada, ejecuta `bun test`.

## Mapa mental del flujo

Antes de profundizar, revisa el motor unificado en `src/engine.ts:33`. `CodexivoEngine.run` se encarga de:

- Crear un `Lexer` y un `Parser` (`src/lexer.ts:22`, `src/parser.ts:87`).
- Construir el AST y manejar errores de análisis.
- Instanciar el evaluador (`src/evaluator.ts:36`) y, si lo pides, activar el `RuntimeTracer` (`src/runtime/tracer.ts:89`).

Ten presente este recorrido; cada actividad siguiente inspecciona una etapa concreta.

## Actividad 1 · Escribe y ejecuta un programa semilla

Lanza el REPL (`bun run repl`) y prueba el siguiente fragmento:

```codexivo
variable saludo = "Codexivo";
procedimiento armaMensaje(nombre) {
  variable prefijo = "Hola ";
  regresa prefijo + nombre;
}
armaMensaje(saludo);
```

Observa el resultado y déjalo como punto de partida. Este código reaparece en cada actividad para que puedas comparar cómo se
representa a distintos niveles.

## Actividad 2 · Sigue los tokens producidos por el lexer

1. Abre `src/lexer.ts:22`. `Lexer.nextToken` recorre el código carácter a carácter y produce instancias de `Token`.
2. Revisa cómo se reconocen identificadores y palabras reservadas en `src/lexer.ts:115` junto con `lookupIdentifier` en
   `src/token.ts:44`.
3. Ejecuta `bun test src/tests/lexer.spec.ts` y localiza el caso "lexer function declaration" (`src/tests/lexer.spec.ts:101`):
   compara los tokens esperados con los que obtuviste en el REPL.

> 👩‍💻 Ejercicio breve: añade un carácter extra (por ejemplo, `#`) a tu programa semilla y vuelve a ejecutar `lexer.spec.ts` para
> observar cómo se reportan tokens `ILLEGAL`.

## Actividad 3 · Visualiza el árbol de sintaxis abstracta

1. Inspecciona `parseProgram` en `src/parser.ts:87`. Observa cómo agrega sentencias al `Program` del AST.
2. Dentro del mismo archivo, identifica `parseFunction` (`src/parser.ts:333`) y `parseCall`
   (`src/parser.ts:173`): son los responsables de tus procedimientos y llamadas.
3. Corre `bun test src/tests/parser.spec.ts` y busca el caso "parse function literal" (`src/tests/parser.spec.ts:496`). Verás
   cómo se espera que se estructuren los nodos `Function` y `Call`.
4. Si quieres una vista serializada del árbol, ejecuta este script desde un archivo temporal:

```ts
import { CodexivoEngine } from './src/engine';

const engine = new CodexivoEngine();
const programa = `variable saludo = "Codexivo";\nprocedimiento armaMensaje(nombre) { regresa nombre; }\narmaMensaje(saludo);`;
const { ast, errors } = engine.getAST(programa, { includePositions: true });
console.log(JSON.stringify(ast, null, 2));
console.log(errors);
```

Observa cómo cada nodo indica línea y columna; estos datos provienen directamente del parser.

## Actividad 4 · Recorre la evaluación paso a paso

1. Revisa `createEvaluator` en `src/evaluator.ts:36`. Allí se decide si instanciar un `RuntimeTracer` y se define la función
   interna `evaluateNode` (`src/evaluator.ts:44`).
2. Sigue cómo se manejan los literales (`src/evaluator.ts:82`), las declaraciones `variable` (`src/evaluator.ts:143`) y las
   invocaciones de procedimientos (`src/evaluator.ts:166`).
3. Ejecuta `bun test src/tests/evaluator.spec.ts` y enfócate en el caso "should evaluate function call" (`src/tests/evaluator.spec.ts:217`) para verificar el comportamiento esperado.
4. Para observar la ejecución en tiempo real, abre `src/runtime/tracer.ts:152` y fíjate en el método `record`. Luego, crea un
   script mínimo:

```ts
import { CodexivoEngine } from './src/engine';

const engine = new CodexivoEngine();
const codigo = `variable saludo = "Codexivo";\nprocedimiento armaMensaje(nombre) { regresa nombre; }\narmaMensaje(saludo);`;
const { trace } = engine.run(codigo, { trace: true });
console.table(trace?.events.map(evento => ({
  paso: evento.step,
  nodo: evento.nodeType,
  operacion: evento.operation,
  resultado: evento.result?.repr,
})));
```

Inspecciona cómo el tracer captura cada transición de entorno (`trace.events[0].changes`).

## Actividad 5 · Explora el entorno y las clausuras

- `Environment` implementa scopes anidados en `src/object.ts:77`. Observa cómo `get` sigue la cadena `outer` para resolver
  identificadores externos.
- El evaluador crea un entorno extendido para cada llamada en `applyFunction` (`src/evaluator.ts:225`). Cambia el valor inicial de
  `saludo` y confirma que la clausura conserva el valor correcto dentro del procedimiento.
- Ejecuta `bun test src/tests/engine.spec.ts` para ver cómo se combinan parseo y evaluación en escenarios completos.

## Actividad 6 · Comprende y ajusta los built-ins

- Revisa la implementación de `longitud` en `src/builtins.ts:4`. Nota cómo se validan aridad y tipos antes de devolver el
  resultado.
- En `src/evaluator.ts:275`, identifica dónde se conectan los built-ins cuando un identificador no está en el entorno actual.
- Prueba a crear un nuevo built-in (por ejemplo, `mayusculas`) y ejecútalo en el REPL. Recuerda añadir también su test espejo en
  `src/tests/evaluator.spec.ts`.

## Checklist de autoevaluación

- [ ] Puedo explicar qué hace `Lexer.nextToken` sin mirar el código.
- [ ] Sé localizar la definición de un nodo AST a partir de su nombre.
- [ ] Comprendo cómo `evaluateNode` delega en funciones auxiliares según el tipo de nodo.
- [ ] Soy capaz de leer la traza de ejecución e identificar en qué paso cambia una variable.
- [ ] Sé dónde registrar un nuevo built-in y cómo probarlo.

## Próximos retos

1. Añade un operador nuevo (por ejemplo, concatenación con `&`) y documenta el cambio replicando la ruta completa: lexer → parser
   → evaluador → tests.
2. Implementa la semántica de `mientras` siguiendo los TODOs existentes en `src/evaluator.ts` y crea ejemplos en el recetario.
3. Escribe una clase corta para tu grupo de estudio usando esta guía como plan de sesiones.

Con este recorrido habrás visto cómo cada módulo del repositorio se relaciona con la experiencia de programar en Codexivo. Usa la
especificación del lenguaje (`docs/lenguaje.md`) y la descripción de arquitectura (`docs/arquitectura.md`) como referencias
rápidas mientras sigues explorando.
