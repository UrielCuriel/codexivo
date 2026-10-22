# Codexivo v1 — Especificación del lenguaje

> **Estado:** propuesta en revisión. Nada de lo que aparece aquí como "v1" está implementado todavía,
> salvo donde se indica. La referencia de lo que funciona hoy sigue siendo [`lenguaje.md`](./lenguaje.md).
>
> Las secciones marcadas con **⚖️ Decisión abierta** necesitan una respuesta antes de implementarse.
> Cada una trae una recomendación.

## 0. Para qué existe este documento

Codexivo es un lenguaje para **practicar lógica**, no para construir productos. Si hoy una IA puede
escribir el código, lo que sigue siendo humano es entenderlo y verificarlo. Esta especificación define
un lenguaje que sirva para eso desde el primer `imprimir` hasta un recorrido en anchura sobre un grafo.

Principios, en orden de prioridad cuando chocan:

1. **Visible.** Todo lo que el lenguaje hace debe poder mostrarse paso a paso: cada decisión, cada
   vuelta, cada valor. Si una característica no se puede visualizar con honestidad, no entra.
2. **Sin magia.** No hay conversiones implícitas ni comportamientos sorpresa. Cuando algo no tiene
   sentido, el programa se detiene y explica por qué.
3. **Verbal y en español.** Palabras antes que símbolos, con `ñ` y acentos. Los símbolos clásicos se
   conservan como alternativa porque el siguiente lenguaje que aprenda la persona los va a usar.
4. **Simple.** Pocos tipos, una sola forma recomendada de hacer cada cosa y nada de módulos ni
   `importar`: todo lo necesario ya está disponible.
5. **En el navegador y determinista.** Sin instalar nada. El mismo programa con la misma entrada
   produce siempre el mismo resultado y la misma cantidad de operaciones.

### Niveles

Cada característica pertenece a un nivel. Los niveles ordenan la documentación y los retos; no
bloquean nada en el editor.

| Nivel | Qué se practica |
| --- | --- |
| 🟢 **Principiante** | Secuencia, variables, entrada/salida, condiciones, bucles |
| 🟡 **Intermedio** | Procedimientos, listas, texto, diccionarios, recursión |
| 🔴 **Avanzado** | Procedimientos como valores, estructuras de datos, algoritmos clásicos |

## 1. Estado actual frente a v1

Probado contra `main` (`1ca0398`). Los 56 tests pasan; esto es lo que **no** cubren.

| Caso | Hoy | v1 |
| --- | --- | --- |
| `1 < 2 y 5 < 4` | Error. `y`/`o` tienen **más** precedencia que las comparaciones y se agrupa como `1 < (2 y 5) < 4` | `falso` |
| `no 1 == 2` | `falso` (se agrupa como `(no 1) == 2`) | `verdadero` |
| `procedimiento suma(a, b) { … }` | Error de sintaxis | Declaración con nombre |
| `// comentario` | Excepción de JavaScript (`value is null or undefined`) | Comentario |
| `%`, `n++`, `n--` | Error de sintaxis | Soportados |
| `a[0] = 9` | Error de sintaxis | Asignación por índice |
| `nulo` | "identificador no encontrado" | Literal |
| `imprimir(…)` / `leer()` | No existen; el programa solo devuelve su última expresión | Entrada y salida |
| `1 / 0` | `Infinity` (el error `DIVISION_BY_ZERO` existe pero no se usa) | Error |
| `[1, 2] == [1, 2]` | `falso` | `verdadero` |
| `mientras (verdadero) {}` | Bloquea el proceso | Error al superar el límite de operaciones |
| `f(20000)` recursivo | `Maximum call stack size exceeded` | Funciona (límite configurable) |
| `hasta_que` | Se tokeniza como `WHILE` | Token propio `UNTIL` |
| Mensajes de error | "en la linea" | "en la línea", con pista |
| Docs y README | Usan `sino`, `n++`, `%` y procedimientos con nombre que nunca funcionaron | Alineados con esta spec |

## 2. Léxico

### 2.1 Identificadores

- Letras del alfabeto latino con acentos y diéresis (`á é í ó ú ü ñ` y mayúsculas), dígitos y `_`.
- No pueden empezar con dígito. Distinguen mayúsculas de minúsculas.
- Convención recomendada: `minúsculas_con_guion_bajo`.

```codexivo
variable año = 2026;
variable canción_favorita = "Cielito lindo";
```

### 2.2 Comentarios

```codexivo
// comentario de una línea
/* comentario
   de varias líneas */
```

### 2.3 Literales

| Literal | Ejemplos | Notas |
| --- | --- | --- |
| Número | `10`, `3.14`, `.5`, `1_000_000` | Un solo tipo numérico (doble precisión). `_` solo como separador visual |
| Texto | `"hola"`, `'mundo'`, `"línea\nnueva"` | Escapes: `\n`, `\t`, `\"`, `\'`, `\\` |
| Lógico | `verdadero`, `falso` | |
| Nulo | `nulo` | Ausencia de valor |
| Lista | `[1, 2, 3]`, `[]` | |
| Diccionario | `{ "nombre": "Ana", "edad": 16 }` | Ver §4.6 |

> **⚖️ Decisión abierta — interpolación de texto.** ¿`"Hola, {nombre}"`?
> **Recomendación:** no en v1. `imprimir("Hola,", nombre)` resuelve el caso común sin agregar sintaxis
> dentro de las cadenas, y `texto(x)` cubre el resto.

### 2.4 Punto y coma

Separa sentencias. Es **opcional al final de línea**, como hoy; la documentación y el formateador del
sandbox siempre lo escriben.

### 2.5 Palabras reservadas

```
variable  constante  procedimiento  regresa
si  pero_si  si_no
mientras  hacer  hasta_que  para  para_cada  en  repetir  veces
romper  continuar
verdadero  falso  nulo
y  o  no  mod  div
es_igual_a  es_distinto_de  es_menor_que  es_mayor_que
es_menor_o_igual_a  es_mayor_o_igual_a
```

### 2.6 Regla de acentos

Todo nombre que en español lleva acento lo lleva en su forma canónica (`máximo`, `número`,
`último`), y **también se acepta sin acento** (`maximo`, `numero`, `ultimo`), porque no todos los
teclados lo facilitan. La documentación y los mensajes usan siempre la forma canónica.

## 3. Tipos y valores

| Tipo (`tipo(x)`) | Valores |
| --- | --- |
| `"número"` | `0`, `-3`, `2.5` |
| `"texto"` | `"hola"` |
| `"lógico"` | `verdadero`, `falso` |
| `"nulo"` | `nulo` |
| `"lista"` | `[1, "a", verdadero]` |
| `"diccionario"` | `{ "a": 1 }` |
| `"procedimiento"` | Procedimientos del usuario y de la biblioteca |

- **Valor contra referencia.** Números, textos, lógicos y `nulo` se copian. Las listas y los
  diccionarios se comparten: dos variables pueden apuntar a la misma lista. El sandbox lo dibuja con
  flechas, porque es uno de los errores más comunes y más difíciles de ver.
- **Texto inmutable.** `t[0] = "x"` es un error; se construye un texto nuevo.

> **⚖️ Decisión abierta — nombre del tipo de las listas.** Hoy los errores dicen `ARREGLO`.
> **Recomendación:** `lista` en la superficie (docs, `tipo()`, mensajes). Es la palabra que alguien
> usa antes de saber qué es un arreglo, y "arreglo" se explica en los docs avanzados.

## 4. Expresiones

### 4.1 Precedencia (de menor a mayor)

| Nivel | Operadores | Asociatividad |
| --- | --- | --- |
| 1 | `o` | izquierda |
| 2 | `y` | izquierda |
| 3 | `no` (`!`) | prefijo |
| 4 | `==` `!=` `<` `>` `<=` `>=` y sus formas en palabras | **sin encadenar** |
| 5 | `+` `-` | izquierda |
| 6 | `*` `/` `div` `mod` (`%`) | izquierda |
| 7 | `-` unario | prefijo |
| 8 | `^` (potencia) | **derecha** |
| 9 | llamada `f(x)`, índice `l[i]`, acceso `d.campo` | izquierda |

- `1 < x < 5` es un error con la pista *"escribe `1 < x y x < 5`"*. Encadenar comparaciones se ve
  natural pero esconde dos comparaciones.
- `-2 ^ 2` es `-4`, como en matemáticas.

### 4.2 Operadores en palabras

Cada forma en palabras es **exactamente equivalente** a su símbolo. El sandbox puede mostrar
cualquiera de las dos.

| Símbolo | Palabra | Ejemplo |
| --- | --- | --- |
| `==` | `es_igual_a` | `si (respuesta es_igual_a 42)` |
| `!=` | `es_distinto_de` | `mientras (letra es_distinto_de "x")` |
| `<` | `es_menor_que` | `edad es_menor_que 18` |
| `>` | `es_mayor_que` | `puntos es_mayor_que récord` |
| `<=` | `es_menor_o_igual_a` | `i es_menor_o_igual_a 10` |
| `>=` | `es_mayor_o_igual_a` | `edad es_mayor_o_igual_a 18` |
| `%` | `mod` | `n mod 2 == 0` |
| — | `div` | `7 div 2` → `3` |
| `!` | `no` | `no encontrado` |

No hay `&&` ni `||`: solo `y` / `o`.

### 4.3 Aritmética

- `/` es división real: `7 / 2` → `3.5`.
- `div` es división entera hacia abajo: `7 div 2` → `3`, `-7 div 2` → `-4`.
- `mod` / `%` es el residuo consistente con `div`: `a == (a div b) * b + (a mod b)`. Así
  `-7 mod 3` → `2`, que es lo que se espera al preguntar "¿es par?" o al dar vueltas en un círculo.
- Dividir entre cero (con `/`, `div` o `mod`) es un error.
- `+` suma números o une textos. **No mezcla**: `"Total: " + 5` es un error con la pista
  *"convierte el número con `texto(5)` o usa `imprimir("Total:", 5)`"*.

### 4.4 Comparación e igualdad

- `==` compara por valor, también listas y diccionarios: `[1, 2] == [1, 2]` → `verdadero`.
- Comparar tipos distintos con `==` regresa `falso`. Con `<`, `>`, `<=`, `>=` es un error.
- Los textos se comparan en orden alfabético por carácter.

### 4.5 Lógica

`y` y `o` evalúan en cortocircuito; la visualización muestra cuándo una parte **no** se evaluó.

> **⚖️ Decisión abierta — condiciones estrictas.** Hoy `si (1)` funciona porque `0`, `""` y `nulo`
> cuentan como falsos.
> **Recomendación:** en v1 las condiciones de `si`, `mientras`, `hasta_que`, `y`, `o` y `no` deben ser
> lógicas. `si (lista)` es un error con la pista *"¿quisiste decir `longitud(lista) > 0`?"*. Obliga a
> decir lo que uno quiere decir, que es justo lo que se practica.

### 4.6 Listas y diccionarios

```codexivo
variable números = [3, 1, 2];
números[0];              // 3
números[-1];             // 2 (desde el final)
números[0] = 10;

variable persona = { "nombre": "Ana", "edad": 16 };
persona["nombre"];       // "Ana"
persona.edad;            // 16, azúcar para persona["edad"]
persona.ciudad = "León"; // agrega la clave
```

- Índices enteros desde `0`. Fuera de rango es un error que muestra el índice y la longitud.
- Las claves de un diccionario son textos o números. `d.campo` solo funciona con claves que sean
  identificadores válidos.
- Leer una clave que no existe es un error con la pista *"usa `tiene(d, clave)` para preguntar
  antes"*.
- Al inicio de una sentencia, `{` abre un bloque; en cualquier otra posición, un diccionario.

## 5. Sentencias

### 5.1 Variables y constantes

```codexivo
variable contador = 0;
constante PI = 3.14159;
contador = contador + 1;
```

- Asignar a una variable no declarada es un error: *"¿olvidaste escribir `variable`?"*.
- Declarar dos veces el mismo nombre en el mismo bloque es un error.
- Reasignar una `constante` es un error.
- **Alcance por bloque:** lo declarado dentro de `{ }` deja de existir al cerrar el bloque.
- Un nombre local puede ocultar uno de la biblioteca (`variable máximo = 0;`); el editor lo advierte.

### 5.2 Asignación compuesta, incremento y decremento

```codexivo
total += precio;   // también -=, *=, /=, %=
i++;
i--;
```

`++` y `--` son **sentencias**, no expresiones: `x = i++` es un error. Así desaparece la pregunta de
"¿`i++` o `++i`?".

### 5.3 Condiciones

```codexivo
si (edad >= 18) {
  imprimir("adulto");
} pero_si (edad >= 13) {
  imprimir("adolescente");
} si_no {
  imprimir("niño");
}
```

Las llaves son obligatorias.

> **⚖️ Decisión abierta — `según`/`caso`** (equivalente a `switch`).
> **Recomendación:** dejarlo fuera de v1. Una cadena de `pero_si` cubre lo mismo y no hay que
> explicar por qué un caso "se cae" al siguiente.

### 5.4 Bucles

```codexivo
// 🟢 repite un número fijo de veces (herencia directa de Karel)
repetir 4 veces {
  avanzar();
}

// 🟢 mientras la condición sea verdadera
mientras (intentos < 3) {
  intentos++;
}

// 🟢 al menos una vez, hasta que la condición sea verdadera
hacer {
  número = leer_número();
} hasta_que (número > 0);

// 🟡 recorrer una lista, un rango o un texto
para_cada fruta en ["mango", "piña"] {
  imprimir(fruta);
}
para_cada i en rango(1, 10) {
  imprimir(i);
}

// 🟡 recorrer un diccionario
para_cada clave, valor en persona {
  imprimir(clave, valor);
}

// 🟡 forma clásica, puente hacia otros lenguajes
para (variable i = 0; i < 10; i++) {
  imprimir(i);
}
```

- `romper` sale del bucle más cercano; `continuar` salta a la siguiente vuelta.
- `repetir n veces` exige un número entero no negativo.
- Modificar la longitud de una lista mientras se recorre con `para_cada` es un error.

### 5.5 Procedimientos

```codexivo
// 🟡 declaración con nombre
procedimiento área_rectángulo(base, altura) {
  regresa base * altura;
}

// 🔴 como valor
variable doble = procedimiento(x) { regresa x * 2; };
mapear([1, 2, 3], doble); // [2, 4, 6]
```

- Las declaraciones con nombre se pueden usar antes de aparecer en su bloque; eso permite la
  recursión mutua.
- Llamar con un número distinto de argumentos es un error. Hoy los faltantes se rellenan con `nulo`;
  en v1 no.
- `regresa` sin valor regresa `nulo`.
- Los procedimientos capturan las variables de donde se crearon (closures).
- La profundidad de recursión solo la limita la configuración (por defecto 10 000), no JavaScript.

## 6. Entrada y salida

| Procedimiento | Qué hace |
| --- | --- |
| `imprimir(a, b, …)` | Escribe los valores separados por un espacio y termina la línea |
| `leer()` | Lee la siguiente línea de entrada como texto. Si no hay más, regresa `nulo` |
| `leer_número()` | Lee la siguiente línea y la convierte en número; si no es un número, error |

- En el **sandbox libre**, `leer()` pausa el programa y pide el dato en la consola.
- En los **retos**, la entrada viene del caso de prueba.
- El valor de la última expresión se sigue mostrando en el REPL y en el sandbox como "resultado",
  pero los retos solo comparan la salida o el valor regresado (§10).

## 7. Errores

Cada error es un objeto, no solo un texto:

```ts
{
  tipo: "léxico" | "sintaxis" | "ejecución" | "límite",
  código: "DIVISIÓN_ENTRE_CERO",
  mensaje: "No se puede dividir entre cero.",
  pista: "Revisa que `divisor` no valga 0 antes de dividir.",
  inicio: { línea: 4, columna: 12 },
  fin: { línea: 4, columna: 23 },
  pila: ["programa", "promedio(lista)"]
}
```

- Los mensajes dicen **qué pasó** y la pista **qué revisar**, en español correcto y con acentos.
- El parser se recupera y reporta varios errores, pero el sandbox destaca el primero.
- `afirmar(condición, mensaje)` detiene el programa si la condición es falsa. Es la herramienta más
  directa para practicar verificación.
- Sin `intentar`/`capturar` en v1: un error detiene el programa, y eso es lo que queremos que se vea.

## 8. Biblioteca estándar

Todo es global; no existe `importar`. Regla para listas: **`agregar`, `insertar`, `quitar` y `vaciar`
cambian la lista; todo lo demás regresa un valor nuevo.**

### 🟢 Básicos

| Nombre | Descripción |
| --- | --- |
| `imprimir`, `leer`, `leer_número` | §6 |
| `tipo(x)` | Nombre del tipo (§3) |
| `texto(x)`, `número(x)` | Conversiones explícitas |
| `longitud(x)` | Elementos de una lista o diccionario, o caracteres de un texto |
| `afirmar(cond, mensaje)` | §7 |

### 🟢 Matemáticas

`absoluto`, `máximo(…)`, `mínimo(…)`, `redondear(x, decimales?)`, `piso`, `techo`, `raíz`, `entero`
(trunca), `aleatorio(a, b)` (entero entre `a` y `b` inclusive), la constante `PI`.

`aleatorio` usa una semilla por ejecución. El sandbox la muestra y permite repetirla, así un programa
"aleatorio" se puede depurar.

### 🟡 Texto

`mayúsculas`, `minúsculas`, `recortar`, `dividir(t, separador)`, `unir(lista, separador)`,
`reemplazar(t, buscar, poner)`, `contiene`, `empieza_con`, `termina_con`, `posición_de` (regresa `-1`
si no está), `subtexto(t, inicio, fin)`, `caracteres(t)`, `código_de(c)`, `carácter_de(n)`.

### 🟡 Listas

| Nombre | Descripción |
| --- | --- |
| `agregar(l, x)` · `insertar(l, i, x)` | Cambian la lista |
| `quitar(l, i)` · `quitar_último(l)` · `quitar_primero(l)` · `vaciar(l)` | Cambian la lista; los tres primeros regresan lo que quitaron |
| `primero`, `último`, `contiene`, `posición_de` | Consulta |
| `rango(a, b, paso?)` | Lista de `a` a `b` **inclusive** |
| `índices(l)` | `rango(0, longitud(l) - 1)` |
| `rebanar(l, inicio, fin)`, `invertir(l)`, `ordenar(l, comparador?)`, `copiar(l)` | Nuevas listas |
| `sumar(l)`, `lista_de(n, valor)`, `matriz(filas, columnas, valor)` | Construcción y resumen. `lista_de` y `matriz` copian el valor en cada casilla, para no compartir sublistas por accidente |

> **⚖️ Decisión abierta — `rango` inclusivo.** `rango(1, 10)` incluye el 10.
> **Recomendación:** inclusivo. Es como lo dice una persona ("del 1 al 10"); `índices(l)` evita el
> `- 1` en el caso típico.

### 🟡 Diccionarios

`claves(d)`, `valores(d)`, `tiene(d, clave)`, `quitar(d, clave)`. El orden de recorrido es el de
inserción.

### 🔴 Procedimientos como valores

`mapear(l, f)`, `filtrar(l, f)`, `reducir(l, f, inicial)`, `alguno(l, f)`, `todos(l, f)`,
`buscar(l, f)` (el primero que cumple, o `nulo`).

### 🔴 Estructuras de datos

Pilas y colas son listas con un vocabulario propio, para que el algoritmo se lea como se explica:

| Pila | Cola | Equivale a |
| --- | --- | --- |
| `apilar(p, x)` | `encolar(c, x)` | `agregar` |
| `desapilar(p)` | — | `quitar_último` |
| — | `desencolar(c)` | `quitar_primero` |
| `tope(p)` | `frente(c)` | `último` / `primero` |

Los conjuntos se modelan con diccionarios (`visitados[nodo] = verdadero`), y los registros con
diccionarios y `.`.

## 9. Ejemplos por nivel

```codexivo
// 🟢 FizzBuzz
para_cada n en rango(1, 15) {
  si (n mod 15 == 0) {
    imprimir("FizzBuzz");
  } pero_si (n mod 3 == 0) {
    imprimir("Fizz");
  } pero_si (n mod 5 == 0) {
    imprimir("Buzz");
  } si_no {
    imprimir(n);
  }
}
```

```codexivo
// 🟡 Búsqueda binaria
procedimiento buscar_binaria(lista, objetivo) {
  variable inicio = 0;
  variable fin = longitud(lista) - 1;
  mientras (inicio <= fin) {
    variable medio = (inicio + fin) div 2;
    si (lista[medio] es_igual_a objetivo) {
      regresa medio;
    } pero_si (lista[medio] es_menor_que objetivo) {
      inicio = medio + 1;
    } si_no {
      fin = medio - 1;
    }
  }
  regresa -1;
}
```

```codexivo
// 🔴 Recorrido en anchura: distancia mínima en un grafo
procedimiento distancia(grafo, origen, destino) {
  variable visitados = { };
  variable cola = [[origen, 0]];
  visitados[origen] = verdadero;

  mientras (longitud(cola) > 0) {
    variable actual = desencolar(cola);
    si (actual[0] == destino) {
      regresa actual[1];
    }
    para_cada vecino en grafo[actual[0]] {
      si (no tiene(visitados, vecino)) {
        visitados[vecino] = verdadero;
        encolar(cola, [vecino, actual[1] + 1]);
      }
    }
  }
  regresa -1;
}
```

## 10. Ejecución, límites y determinismo

- **Operaciones.** Cada nodo evaluado cuenta como una operación. Los procedimientos de la biblioteca
  cuentan según el trabajo que hacen (por ejemplo, `ordenar` sobre `n` elementos cuesta
  `n · log₂ n`). La misma ejecución da siempre el mismo número, y los retos lo usan en lugar del
  tiempo.
- **Límites configurables** con valores por defecto: operaciones (10 millones en el sandbox; cada
  reto define el suyo), profundidad de recursión (10 000) y tamaño de la salida (1 MB). Superarlos es
  un error de tipo `límite` que explica qué se superó y dónde estaba el programa.
- **Ejecución reanudable.** El intérprete avanza un paso a la vez y se puede pausar, avanzar,
  retroceder (por instantáneas) o esperar a `leer()`. Corre en un Web Worker para no congelar la
  página.
- **Contratos de los retos:**
  - *Estilo HackerRank:* el programa lee con `leer()` y se compara lo que imprime.
  - *Estilo LeetCode:* el reto llama a un procedimiento (`resolver(...)`) y compara lo que regresa.

## 11. Contrato para la visualización

Es lo que necesitan el sandbox, los diagramas, la máquina de estados y el modo mundo.

- Cada nodo del AST tiene un identificador estable y su **rango** en el código (inicio y fin, en
  línea, columna y desplazamiento).
- Cada token conserva su rango, para la vista de tokens.
- El evaluador emite eventos: `entra`/`sale` de nodo, `declara`, `asigna` (antes/después), `decide`
  (condición, valor y rama tomada), `itera`, `llama`/`regresa`, `imprime`/`lee`, `error`.
- Cada evento lleva una instantánea de los alcances visibles. Listas y diccionarios tienen un
  identificador de referencia, para dibujar cuándo dos variables comparten el mismo valor.
- El diagrama de flujo se genera desde el AST; la máquina de estados se anima desde los eventos.
  Ninguno de los dos inventa información que el intérprete no produjo.

## 12. Modo mundo (Karel)

El mismo lenguaje con procedimientos adicionales para controlar un robot en una cuadrícula. Solo
existen cuando el programa corre en un mundo.

| Acción | Pregunta |
| --- | --- |
| `avanzar()` | `frente_libre()`, `izquierda_libre()`, `derecha_libre()` |
| `girar_izquierda()` | `hay_zumbador()` |
| `recoger_zumbador()` | `tengo_zumbadores()` |
| `dejar_zumbador()` | `mirando_al_norte()`, `mirando_al_sur()`, `mirando_al_este()`, `mirando_al_oeste()` |
| `apagar()` | |

Chocar con una pared o recoger donde no hay zumbadores es un error de ejecución, con la posición del
robot. No hay `girar_derecha()`: construirlo con tres `girar_izquierda()` es el primer ejercicio, igual
que en Karel.

## 13. Fuera de v1

Módulos e `importar`, clases y métodos, `intentar`/`capturar`, asincronía, archivos, red, tipos
estáticos y `según`/`caso`. Se pueden reconsiderar después, siempre con el principio 1 como filtro.

## 14. Cambios que rompen programas existentes

Codexivo no tiene usuarios todavía, así que v1 se permite romper compatibilidad:

- condiciones estrictas (si se aprueba §4.5);
- error al llamar con un número distinto de argumentos;
- error al redeclarar o al asignar sin declarar;
- `agregar` pasa a modificar la lista (hoy regresa una nueva);
- `1 / 0` pasa a ser error;
- `ARREGLO` pasa a llamarse `lista` en mensajes y en `tipo()`.

## 15. Decisiones abiertas

| # | Tema | Recomendación |
| --- | --- | --- |
| 1 | Interpolación de texto (§2.3) | No en v1 |
| 2 | Nombre del tipo de las listas (§3) | `lista` |
| 3 | Condiciones estrictas (§4.5) | Sí |
| 4 | `según`/`caso` (§5.3) | No en v1 |
| 5 | `rango` inclusivo (§8) | Sí |

## 16. Orden de implementación propuesto

1. **Cimientos:** Bun 1.4.4, limpieza de dependencias, rangos en tokens y nodos, errores
   estructurados.
2. **Correcciones:** precedencia de `y`/`o`/`no`, comentarios, `nulo`, división entre cero, igualdad
   por valor, `hasta_que`.
3. **Evaluador reanudable** con generadores: pila propia, límites, eventos (§10–11). Reemplaza al
   `RuntimeTracer` actual.
4. **Nivel principiante:** `imprimir`/`leer`, `repetir … veces`, `++`/`--`, `%`/`mod`/`div`, `^`,
   operadores en palabras, `constante`, alcance por bloque.
5. **Nivel intermedio:** procedimientos con nombre, `para_cada`, `romper`/`continuar`, asignación por
   índice, diccionarios, biblioteca de texto y listas.
6. **Nivel avanzado:** procedimientos como valores, estructuras de datos, costo por operación de la
   biblioteca.
7. **Modo mundo.**

Cada paso llega con tests y actualiza `lenguaje.md` para que la documentación nunca vuelva a prometer
lo que el código no hace.
