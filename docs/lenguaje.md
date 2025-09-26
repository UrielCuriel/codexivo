# Especificación del lenguaje Codexivo

Esta guía define Codexivo como si fuera un lenguaje de programación formal. Describe qué construcciones son válidas, cómo se
interpreta cada una y qué mensajes de error expone el intérprete. Úsala como referencia definitiva mientras escribes código.

## Filosofía general

Codexivo está pensado para personas hispanohablantes que se inician en programación. Sus decisiones de diseño buscan:

- **Claridad verbal**: se prefieren palabras clave en español sobre símbolos crípticos.
- **Modelo mental cercano a JavaScript**: las expresiones se evalúan de izquierda a derecha y los procedimientos funcionan como
  funciones regulares.
- **Simplicidad en tipos**: actualmente se soportan números, cadenas, booleanos y el valor especial `nulo`.

## Estructura de un programa

Un programa es una secuencia de declaraciones separadas por punto y coma opcional (`;`). El intérprete ignora saltos de línea y
espacios en blanco, de modo que puedes formatear tu código libremente. Internamente cada archivo se convierte en un `Program`
con una lista de nodos del árbol de sintaxis abstracta (AST). 【F:src/ast.ts†L33-L61】

## Palabras reservadas

Las siguientes palabras tienen significado especial y no pueden utilizarse como identificadores ni nombres de parámetros:

```
hacer, hasta_que, pero_si, procedimiento, regresa, si, si_no, falso, variable,
verdadero, mientras, no, o, para, y
```

Son detectadas tanto en el léxico como al validar identificadores. 【F:src/token.ts†L44-L75】【F:src/parser.ts†L560-L567】

## Literales y operadores

### Números

- Se aceptan enteros y decimales escritos con punto (`10`, `0.5`, `.8`).
- Los operadores aritméticos soportados son `+`, `-`, `*`, `/` y la negación prefija `-`. 【F:src/evaluator.ts†L330-L382】
- El intérprete conserva la precisión de los decimales según lo provea JavaScript.

### Booleanos

- Las constantes `verdadero` y `falso` evalúan a valores lógicos.
- Puedes combinarlos con los operadores de comparación (`==`, `!=`, `<`, `>`, `<=`, `>=`) y con las operaciones lógicas `y`,
  `o` y la negación `!`. 【F:src/token.ts†L1-L43】【F:src/evaluator.ts†L382-L422】
- Toda expresión tiene una "verdad" implícita: `0`, cadenas vacías y `nulo` se consideran falsy, el resto truthy. 【F:src/evaluator.ts†L443-L462】

### Cadenas de texto

- Se delimita con comillas simples o dobles (`"hola"`, `'mundo'`). 【F:src/lexer.ts†L58-L89】
- Puede concatenarse con `+` y compararse con `==` / `!=`. 【F:src/evaluator.ts†L394-L421】

### Agrupación y precedencia

Usa paréntesis para agrupar expresiones y forzar la precedencia estándar (multiplicación y división antes que suma y resta). El
parser emplea un sistema de precedencias inspirado en Pratt parsing. 【F:src/parser.ts†L40-L119】【F:src/parser.ts†L230-L246】

## Declaraciones y expresiones

### Variables

Declara variables con la palabra clave `variable` seguida de un identificador y una expresión asignada:

```codexivo
variable edad = 16;
variable mensaje = "Hola" + " mundo";
```

Cada declaración produce un nodo `LetStatement` y, al evaluarse, almacena el resultado en el entorno actual. 【F:src/parser.ts†L536-L568】【F:src/evaluator.ts†L120-L143】

### Expresiones sueltas

Cualquier expresión puede aparecer como sentencia; su valor se devuelve como resultado del programa si es la última en ejecutarse.
Esto permite escribir scripts orientados a cálculo rápido en el REPL. 【F:src/parser.ts†L500-L533】【F:src/evaluator.ts†L57-L77】

### Procedimientos (funciones)

Los procedimientos encapsulan lógica reutilizable y admiten parámetros por nombre:

```codexivo
variable saludar = procedimiento(nombre) {
  regresa "Hola " + nombre;
};

saludar("Uriel");
```

- Se definen con `procedimiento(<parametros>) { ... }`.
- Pueden asignarse a variables o retornarse desde otros procedimientos.
- Dentro del cuerpo es válido usar `regresa` para devolver un valor y terminar la ejecución. 【F:src/parser.ts†L448-L523】【F:src/evaluator.ts†L143-L215】

### Llamadas a procedimientos

Invoca un procedimiento escribiendo su nombre seguido de paréntesis con los argumentos separados por comas. Durante la ejecución
se crea un entorno interno que vincula cada parámetro con el valor recibido; los argumentos faltantes se rellenan con `nulo`.
【F:src/parser.ts†L124-L203】【F:src/evaluator.ts†L212-L320】

### Sentencias condicionales

Codexivo ofrece estructuras condicionales encadenadas:

```codexivo
si (edad >= 18) {
  regresa "adulto";
} pero_si (edad >= 13) {
  regresa "adolescente";
} si_no {
  regresa "niño";
}
```

- `si` evalúa la condición y ejecuta el bloque correspondiente.
- `pero_si` agrega ramas evaluadas en cascada.
- `si_no` actúa como rama por defecto.
- Las condiciones usan las reglas de verdad descritas arriba. 【F:src/parser.ts†L324-L399】【F:src/evaluator.ts†L215-L248】

### Bucles

El analizador reconoce las formas `mientras`, `hacer { ... } hasta_que (...)` y `para (...)`. Sin embargo, la versión actual del
evaluador solo ejecuta expresiones condicionales y funciones; los bucles están en fase de diseño. Aprovecha esta sintaxis para
explorar el AST, pero espera futuras versiones para una semántica completa. 【F:src/parser.ts†L204-L343】【F:src/evaluator.ts†L33-L320】

## Bibliotecas estándar

Por ahora existe un conjunto reducido de funciones built-in. Cada llamada se valida en cuanto al número y tipo de argumentos.

| Nombre     | Descripción                                   | Firma                  |
|------------|-----------------------------------------------|------------------------|
| `longitud` | Devuelve la cantidad de caracteres de una cadena. | `longitud(cadena)` |

Internamente los built-ins viven en `src/builtins.ts` y se exponen automáticamente al resolver identificadores. 【F:src/builtins.ts†L1-L16】【F:src/evaluator.ts†L248-L320】

## Manejo de errores

Cuando se detecta un problema semántico, el evaluador genera objetos de error con mensajes en español que incluyen la ubicación
(linea y columna). Entre los casos cubiertos están: uso de palabras reservadas, tipos incompatibles, identificadores desconocidos
u operadores inválidos. 【F:src/errors.ts†L1-L200】【F:src/evaluator.ts†L248-L352】

El parser también acumula errores sintácticos si encuentra tokens inesperados o identificadores prohibidos. Revísalos antes de
ejecutar un programa. 【F:src/parser.ts†L86-L117】【F:src/parser.ts†L244-L285】

## Valor de un programa

El resultado de ejecutar un archivo es el valor de la última sentencia evaluada (o el valor retornado explícitamente). Si ninguna
sentencia produce resultado, el programa devuelve `nulo`. Esto es útil para experimentar en el REPL y para escribir scripts que
simplemente imprimen o retornan valores. 【F:src/evaluator.ts†L41-L83】

## Próximos pasos

- Completar la semántica de bucles y arreglos.
- Ampliar la biblioteca estándar (entrada/salida, estructuras de datos).
- Documentar futuras características en este mismo estándar.

Mantén esta especificación a mano mientras practicas: cada ejemplo de código en el recetario hace referencia a los apartados
anteriores para reforzar el aprendizaje progresivo.
