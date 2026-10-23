# El lenguaje Codexivo, hoy

Esta guía describe **lo que funciona hoy** en el intérprete. Todos los ejemplos se ejecutan tal cual. El diseño completo hacia
donde va el lenguaje está en la [especificación v1](./especificacion-v1.md); lo que aquí no aparece, todavía no existe.

## Un programa

Un programa es una lista de sentencias. El punto y coma al final de cada sentencia es opcional si la siguiente empieza en otra
línea. El valor de un programa es el de su última expresión, o lo que regrese con `regresa`.

El mismo lenguaje funciona mediante la biblioteca ESM `codexivo`, el comando npm `codexivo` (sin instalar Bun) y los ejecutables
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
variable  constante  procedimiento  regresa
si  pero_si  si_no
mientras  hacer  hasta_que  para  para_cada  en  repetir  veces
romper  continuar
verdadero  falso  nulo
y  o  no  mod  div
es_igual_a  es_distinto_de  es_menor_que  es_mayor_que
es_menor_o_igual_a  es_mayor_o_igual_a
```

## Valores

| Tipo          | Ejemplos                                                                      |
| ------------- | ----------------------------------------------------------------------------- |
| número        | `10`, `3.14`, `.5`, `-2`, `1_000_000` (el `_` solo separa grupos de dígitos)  |
| texto         | `"hola"`, `'mundo'`, `"línea\nnueva"` (escapes: `\n`, `\t`, `\\`, `\"`, `\'`) |
| lógico        | `verdadero`, `falso`                                                          |
| nulo          | `nulo`                                                                        |
| lista         | `[1, "a", verdadero]`                                                         |
| procedimiento | `procedimiento(x) { regresa x * 2; }`                                         |

Las listas se comparten: si dos variables apuntan a la misma lista, un cambio se ve desde las dos.

## Variables

```codexivo
variable contador = 0;
contador = contador + 1;
contador += 5;   // también -=, *=, /=, %=
contador++;      // suma 1
contador--;      // resta 1

constante LADOS = 4;
imprimir(LADOS * contador);
```

- Toda variable se declara una vez con `variable` y un valor inicial.
- Asignar a una variable sin declararla es un error.
- Una `constante` no se puede cambiar: reasignarla (con `=`, `+=`, `++`…) es un error.
- `++` y `--` son sentencias, no expresiones: `x = i++` es un error. Escribe `i++;` en su propia línea.
- Lo que se declara dentro de un bloque `{ }` solo existe dentro de él.

Los nombres pueden llevar `ñ`, acentos y diéresis: `año`, `canción`, `pingüino`.

## Operadores

De menor a mayor precedencia:

| Operadores                                           | Notas                                                                    |
| ---------------------------------------------------- | ------------------------------------------------------------------------ |
| `o`                                                  | Cortocircuito                                                            |
| `y`                                                  | Cortocircuito                                                            |
| `no`, `!`                                            |                                                                          |
| `==` `!=` `<` `>` `<=` `>=` y sus formas en palabras | No se pueden encadenar: `1 < x < 5` es un error; escribe `1 < x y x < 5` |
| `+` `-`                                              | `+` también une dos textos                                               |
| `*` `/` `div` `mod` (`%`)                            | Dividir entre cero (con `/`, `div` o `mod`) es un error                  |
| `-` (signo)                                          |                                                                          |
| `^`                                                  | Potencia, asociativa a la derecha: `2 ^ 3 ^ 2` es `2 ^ 9`                |
| llamadas `f(x)`, índices `lista[i]`                  |                                                                          |

```codexivo
7 / 2;     // 3.5, división real
7 div 2;   // 3, división entera hacia abajo
-7 div 2;  // -4
7 mod 3;   // 1, el residuo (también 7 % 3)
-7 mod 3;  // 2: siempre se cumple a == (a div b) * b + (a mod b)
-2 ^ 2;    // -4, como en matemáticas: la potencia va antes que el signo
```

Cada comparación tiene una forma en palabras que significa exactamente lo mismo:

| Símbolo | Palabra              |
| ------- | -------------------- |
| `==`    | `es_igual_a`         |
| `!=`    | `es_distinto_de`     |
| `<`     | `es_menor_que`       |
| `>`     | `es_mayor_que`       |
| `<=`    | `es_menor_o_igual_a` |
| `>=`    | `es_mayor_o_igual_a` |

```codexivo
variable edad = 16;
si (edad es_mayor_o_igual_a 13 y edad es_menor_que 18) {
  imprimir("adolescente");
}
```

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

para (variable j = 0; j < 3; j++) {
  imprimir(j);
}

repetir 3 veces {
  imprimir("¡hola!");
}

para_cada fruta en ["mango", "piña"] {
  imprimir(fruta);
}

para_cada letra en "hola" {
  imprimir(letra);
}

para_cada n en rango(1, 10) {
  si (n mod 2 == 0) {
    continuar;   // salta a la siguiente vuelta
  }
  si (n > 7) {
    romper;      // sale del bucle
  }
  imprimir(n);
}
```

- `hacer … hasta_que` ejecuta el bloque al menos una vez y repite **hasta que** la condición sea verdadera.
- La variable de un `para` solo existe dentro del bucle.
- `repetir n veces` evalúa `n` una sola vez, al empezar. Tiene que ser un número entero, 0 o más; con 0 el bloque no se
  ejecuta. Lleva la cuenta por dentro, sin crear ninguna variable.
- `para_cada x en …` recorre una lista o un texto. `x` es nueva en cada vuelta y solo existe dentro del cuerpo. Cambiar
  elementos de la lista mientras se recorre está bien; agregar o quitar elementos es un error.
- `romper` sale del bucle más cercano y `continuar` salta a su siguiente vuelta. Fuera de un bucle son un error, también
  dentro de un procedimiento que se llama desde un bucle.

## Procedimientos

```codexivo
procedimiento área(base, altura) {
  regresa base * altura;
}
área(3, 4);

// también como valor, guardado en una variable
variable saludar = procedimiento(nombre) {
  regresa "Hola, " + nombre;
};
saludar("Uriel");
```

- Un procedimiento con nombre existe desde el inicio de su bloque: se puede llamar antes de la línea donde se declara, y
  dos procedimientos pueden llamarse entre sí. Su nombre no se puede repetir en el mismo bloque.
- Hay que llamarlos con exactamente tantos valores como parámetros.
- Sin `regresa`, un procedimiento regresa `nulo`.
- Recuerdan las variables de donde se crearon (closures) y pueden llamarse a sí mismos.

## Listas y textos

```codexivo
variable números = [10, 20, 30];
números[0];    // 10
números[-1];   // 30, desde el final
"hola"[1];     // "o"

números[0] = 15;
números[-1] += 1;
números[1]++;

variable matriz = [[1, 2], [3, 4]];
matriz[1][0] = 9;
```

- Los índices son enteros desde 0; un índice fuera de rango es un error que dice cuántos elementos hay.
- Los textos no se pueden cambiar letra por letra: `t[0] = "H"` es un error. Se construye un texto nuevo.

## Biblioteca

Los nombres con acento también se aceptan sin él (`máximo` o `maximo`).

| Procedimiento                     | Qué hace                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------ |
| `imprimir(a, b, …)`               | Escribe los valores separados por un espacio y termina la línea                |
| `leer()`                          | Siguiente línea de entrada como texto, o `nulo` si ya no hay                   |
| `leer_número()`                   | Siguiente línea de entrada como número                                         |
| `tipo(x)`                         | `"número"`, `"texto"`, `"lógico"`, `"nulo"`, `"lista"` o `"procedimiento"`     |
| `texto(x)`, `número(x)`           | Conversiones explícitas                                                        |
| `longitud(x)`                     | Caracteres de un texto o elementos de una lista                                |
| `absoluto(x)`                     | Valor absoluto                                                                 |
| `máximo(…)`, `mínimo(…)`          | De varios números o de una lista                                               |
| `redondear(x, decimales?)`        | Redondea; los `.5` se alejan del cero                                          |
| `PI`                              | La constante 3.14159…; una variable tuya con el mismo nombre la oculta         |
| `agregar(lista, x)`               | Agrega al final (cambia la lista)                                              |
| `rango(a, b, paso?)`              | Lista de `a` a `b`, **incluyendo** `b`; con `paso` negativo cuenta hacia abajo |
| `índices(lista)`                  | Las posiciones válidas: `rango(0, longitud(lista) - 1)`                        |
| `primero(lista)`, `último(lista)` | Primer y último elemento                                                       |

## Errores

Cada error dice de qué tipo es (léxico, sintaxis, ejecución o límite), qué pasó, dónde y, casi siempre, una pista:

```
Error de ejecución en la línea 2, columna 5: No se puede dividir entre cero.
Pista: Revisa que el divisor no valga 0 antes de dividir.
```

## Límites

Para que un error nunca congele la página, la ejecución se detiene con un error de límite al superar 10 000 000 de
operaciones, 10 000 llamadas anidadas o 1 000 000 de caracteres impresos. Los tres se pueden configurar.
