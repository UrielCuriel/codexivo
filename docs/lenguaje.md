# El lenguaje Codexivo, hoy

Esta guía describe **lo que funciona hoy** en el intérprete. Todos los ejemplos se ejecutan tal cual. El diseño completo hacia
donde va el lenguaje está en la [especificación v1](./especificacion-v1.md); lo que aquí no aparece, todavía no existe.

## Un programa

Un programa es una lista de sentencias. El punto y coma al final de cada sentencia es opcional si la siguiente empieza en otra
línea. El valor de un programa es el de su última expresión, o lo que regrese con `regresa`.

El mismo lenguaje funciona mediante la biblioteca ESM `codexivo`, el comando npm `codexivo` (con Bun) y los ejecutables
autónomos de cada sistema. Consulta [REPL y terminal](./repl.md) para ejecutar archivos y proporcionar entrada estándar.

```codexivo
// comentario de una línea
/* comentario
   de varias líneas */
variable nombre = "Ana"
imprimir("Hola,", nombre)
```

## Palabras reservadas

```
variable  procedimiento  regresa
si  pero_si  si_no  mientras  hacer  hasta_que  para
verdadero  falso  nulo  y  o  no
```

## Valores

| Tipo | Ejemplos |
| --- | --- |
| número | `10`, `3.14`, `.5`, `-2` |
| texto | `"hola"`, `'mundo'`, `"línea\nnueva"` (escapes: `\n`, `\t`, `\\`, `\"`, `\'`) |
| lógico | `verdadero`, `falso` |
| nulo | `nulo` |
| lista | `[1, "a", verdadero]` |
| procedimiento | `procedimiento(x) { regresa x * 2; }` |

Las listas se comparten: si dos variables apuntan a la misma lista, un cambio se ve desde las dos.

## Variables

```codexivo
variable contador = 0;
contador = contador + 1;
contador += 5;   // también -=, *=, /=
```

- Toda variable se declara una vez con `variable` y un valor inicial.
- Asignar a una variable sin declararla es un error.
- Lo que se declara dentro de un bloque `{ }` solo existe dentro de él.

Los nombres pueden llevar `ñ`, acentos y diéresis: `año`, `canción`, `pingüino`.

## Operadores

De menor a mayor precedencia:

| Operadores | Notas |
| --- | --- |
| `o` | Cortocircuito |
| `y` | Cortocircuito |
| `no`, `!` | |
| `==` `!=` `<` `>` `<=` `>=` | No se pueden encadenar: `1 < x < 5` es un error; escribe `1 < x y x < 5` |
| `+` `-` | `+` también une dos textos |
| `*` `/` | `/` es división real; dividir entre cero es un error |
| `-` (signo) | |
| llamadas `f(x)`, índices `lista[i]` | |

- `==` compara por valor, también listas: `[1, 2] == [1, 2]` es `verdadero`.
- `+` no mezcla textos y números: `"Total: " + 5` es un error. Usa `texto(5)` o `imprimir("Total:", 5)`.
- `y`, `o`, `no` y las condiciones solo aceptan `verdadero` o `falso`. `si (1)` es un error con una pista.

## Condiciones y bucles

```codexivo
variable edad = 15;
si (edad >= 18) {
  imprimir("adulto");
} pero_si (edad >= 13) {
  imprimir("adolescente");
} si_no {
  imprimir("niño");
}

variable i = 0;
mientras (i < 3) {
  i += 1;
}

hacer {
  i -= 1;
} hasta_que (i == 0);

para (variable j = 0; j < 3; j += 1) {
  imprimir(j);
}
```

- `hacer … hasta_que` ejecuta el bloque al menos una vez y repite **hasta que** la condición sea verdadera.
- La variable de un `para` solo existe dentro del bucle.

## Procedimientos

```codexivo
variable saludar = procedimiento(nombre) {
  regresa "Hola, " + nombre;
};
saludar("Uriel");
```

- Se crean con `procedimiento(parámetros) { … }` y se guardan en variables.
- Hay que llamarlos con exactamente tantos valores como parámetros.
- Sin `regresa`, un procedimiento regresa `nulo`.
- Recuerdan las variables de donde se crearon (closures) y pueden llamarse a sí mismos.

Los procedimientos con nombre (`procedimiento saludar(nombre) { … }`) llegarán con la v1.

## Listas y textos

```codexivo
variable números = [10, 20, 30];
números[0];    // 10
números[-1];   // 30, desde el final
"hola"[1];     // "o"
```

Los índices son enteros desde 0; un índice fuera de rango es un error que dice cuántos elementos hay.

## Biblioteca

Los nombres con acento también se aceptan sin él (`máximo` o `maximo`).

| Procedimiento | Qué hace |
| --- | --- |
| `imprimir(a, b, …)` | Escribe los valores separados por un espacio y termina la línea |
| `leer()` | Siguiente línea de entrada como texto, o `nulo` si ya no hay |
| `leer_número()` | Siguiente línea de entrada como número |
| `tipo(x)` | `"número"`, `"texto"`, `"lógico"`, `"nulo"`, `"lista"` o `"procedimiento"` |
| `texto(x)`, `número(x)` | Conversiones explícitas |
| `longitud(x)` | Caracteres de un texto o elementos de una lista |
| `absoluto(x)` | Valor absoluto |
| `máximo(…)`, `mínimo(…)` | De varios números o de una lista |
| `redondear(x, decimales?)` | Redondea; los `.5` se alejan del cero |
| `agregar(lista, x)` | Agrega al final (cambia la lista) |
| `primero(lista)`, `último(lista)` | Primer y último elemento |

## Errores

Cada error dice de qué tipo es (léxico, sintaxis, ejecución o límite), qué pasó, dónde y, casi siempre, una pista:

```
Error de ejecución en la línea 2, columna 5: No se puede dividir entre cero.
Pista: Revisa que el divisor no valga 0 antes de dividir.
```

## Límites

Para que un error nunca congele la página, la ejecución se detiene con un error de límite al superar 10 000 000 de
operaciones, 10 000 llamadas anidadas o 1 000 000 de caracteres impresos. Los tres se pueden configurar.
