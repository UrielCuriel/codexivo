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
variable  constante  procedimiento  regresa  dominio
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
| diccionario   | `{ "nombre": "Ana", "edad": 16 }`                                             |
| procedimiento | `procedimiento(x) { regresa x * 2; }`                                         |

Las listas y los diccionarios se comparten: si dos variables apuntan a la misma lista, un cambio se ve desde las dos.

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

## Diccionarios

```codexivo
variable persona = { "nombre": "Ana", "edad": 16 };
persona["nombre"];        // "Ana"
persona.edad;             // 16, lo mismo que persona["edad"]
persona.ciudad = "León";  // agrega la clave
persona.edad += 1;

para_cada clave, valor en persona {
  imprimir(clave, valor);
}

si (tiene(persona, "correo")) {
  imprimir(persona.correo);
}

variable calculadora = {
  "suma": procedimiento(a, b) { regresa a + b; },
};
calculadora.suma(1, 3);   // 4
```

- Las claves son textos o números (`1` y `"1"` son claves distintas) y van entre comillas: `{ nombre: "Ana" }` es un
  error. Para usar el valor de una variable como clave, escríbela entre paréntesis: `{ (clave): 1 }`.
- `d.campo` funciona con claves que son nombres válidos; para las demás, `d["clave con espacios"]`.
- Leer una clave que no existe es un error; pregunta antes con `tiene(d, clave)`.
- Se recorren en el orden en que se agregaron las claves: `para_cada clave en d` da solo las claves y
  `para_cada clave, valor en d`, las dos. Agregar o quitar claves mientras se recorre es un error.
- `==` compara por valor sin importar el orden: `{ "a": 1, "b": 2 } == { "b": 2, "a": 1 }` es `verdadero`.
- Al inicio de una sentencia, `{` abre un bloque; en cualquier otra posición, un diccionario.

## Dominios

Un `dominio` es un espacio de nombres: agrupa procedimientos, variables y constantes bajo un nombre, y desde fuera se usan
con `.`. No es un módulo ni hay que importarlo: se declara en el mismo programa.

```codexivo
dominio calculadora {
  constante PRECISIÓN = 2;
  variable operaciones = 0;

  procedimiento suma(a, b) {
    operaciones++;
    regresa redondear(a + b, PRECISIÓN);
  }

  procedimiento promedio(a, b) {
    regresa suma(a, b) / 2;   // dentro del dominio, sin prefijo
  }
}

calculadora.suma(1, 3);         // 4
calculadora.promedio(2, 3);     // 2.5
calculadora.operaciones;        // 2

dominio geometría {
  dominio círculo {
    procedimiento área(r) {
      regresa PI * r ^ 2;
    }
  }
}
geometría.círculo.área(1);
```

- Dentro de un dominio solo van declaraciones: `variable`, `constante`, `procedimiento` y otros `dominio`. Un `si` o un
  `imprimir` van dentro de un procedimiento del dominio o fuera de él.
- Dentro, los miembros se usan sin prefijo y ven lo que está fuera del dominio. Fuera, se usan con `.`:
  `calculadora.suma`. Sin el prefijo no existen.
- Desde fuera solo se pueden cambiar los miembros declarados con `variable` (`calculadora.operaciones = 0`). Las
  constantes, los procedimientos y los dominios que contiene quedan fijos, y no se pueden agregar miembros nuevos.
- El nombre del dominio no se puede reasignar. `tipo(calculadora)` es `"dominio"`.

## Procedimientos como valores

Un procedimiento es un valor como cualquier otro: se guarda en variables, en listas y diccionarios, y se le pasa a otros
procedimientos. La biblioteca trae varios que reciben uno:

```codexivo
variable números = [3, 8, 1, 6];
procedimiento es_par(n) {
  regresa n mod 2 == 0;
}

mapear(números, procedimiento(n) { regresa n * 10; });       // [30, 80, 10, 60]
filtrar(números, es_par);                                      // [8, 6]
reducir(números, procedimiento(total, n) { regresa total + n; }, 0); // 18
alguno(números, es_par);                                       // verdadero
todos(números, es_par);                                        // falso
buscar(números, procedimiento(n) { regresa n > 5; });          // 8
ordenar(números, procedimiento(a, b) { regresa a > b; });      // [8, 6, 3, 1]
```

| Procedimiento                | Qué hace                                                                                |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| `mapear(lista, f)`           | Lista nueva con `f(x)` de cada elemento                                                 |
| `filtrar(lista, f)`          | Lista nueva con los elementos para los que `f(x)` es `verdadero`                        |
| `reducir(lista, f, inicial)` | Junta todo en un valor: empieza con `inicial` y en cada elemento hace `f(acumulado, x)` |
| `alguno(lista, f)`           | `verdadero` si `f(x)` es `verdadero` para al menos un elemento                          |
| `todos(lista, f)`            | `verdadero` si `f(x)` es `verdadero` para todos                                         |
| `buscar(lista, f)`           | El primer elemento con `f(x)` `verdadero`, o `nulo`                                     |
| `ordenar(lista, va_antes)`   | Lista nueva ordenada; `va_antes(a, b)` responde «¿va `a` antes que `b`?»                |

- `f` de `filtrar`, `alguno`, `todos` y `buscar`, y el comparador de `ordenar`, tienen que regresar `verdadero` o `falso`.
- `ordenar` es estable: los elementos que el comparador no distingue conservan su orden.
- Un error dentro de `f` dice dónde está y desde dónde se llamó: `programa > mapear > f`.

## Pilas y colas

Son listas con un vocabulario propio, para que el algoritmo se lea como se explica:

| Pila           | Cola            | Qué hace                               |
| -------------- | --------------- | -------------------------------------- |
| `apilar(p, x)` | `encolar(c, x)` | Agrega al final                        |
| `desapilar(p)` | `desencolar(c)` | Quita y regresa el último / el primero |
| `tope(p)`      | `frente(c)`     | Regresa, sin quitarlo, el que saldría  |

```codexivo
variable pendientes = [];
encolar(pendientes, "lavar");
encolar(pendientes, "secar");
imprimir(desencolar(pendientes), frente(pendientes));

variable pila = [];
apilar(pila, 1);
apilar(pila, 2);
imprimir(desapilar(pila), tope(pila));
```

Sacar de una pila o cola vacía es un error: _"No se puede `desencolar` de una cola vacía."_

## Biblioteca

Todo está disponible sin importar nada. Los nombres con acento también se aceptan sin él (`máximo` o `maximo`).

### Entrada, salida y tipos

| Procedimiento           | Qué hace                                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------------- |
| `imprimir(a, b, …)`     | Escribe los valores separados por un espacio y termina la línea                                          |
| `leer()`                | Siguiente línea de entrada como texto, o `nulo` si ya no hay                                             |
| `leer_número()`         | Siguiente línea de entrada como número                                                                   |
| `tipo(x)`               | `"número"`, `"texto"`, `"lógico"`, `"nulo"`, `"lista"`, `"diccionario"`, `"dominio"` o `"procedimiento"` |
| `texto(x)`, `número(x)` | Conversiones explícitas                                                                                  |
| `longitud(x)`           | Caracteres de un texto, elementos de una lista o claves de un diccionario                                |

### Matemáticas

| Procedimiento              | Qué hace                                                               |
| -------------------------- | ---------------------------------------------------------------------- |
| `absoluto(x)`              | Valor absoluto                                                         |
| `máximo(…)`, `mínimo(…)`   | De varios números o de una lista                                       |
| `redondear(x, decimales?)` | Redondea; los `.5` se alejan del cero                                  |
| `piso(x)`, `techo(x)`      | Redondea hacia abajo o hacia arriba: `piso(-2.1)` es `-3`              |
| `entero(x)`                | Quita los decimales: `entero(-2.7)` es `-2`                            |
| `raíz(x)`                  | Raíz cuadrada; de un número negativo es un error                       |
| `aleatorio(a, b)`          | Un entero al azar entre `a` y `b`, los dos incluidos                   |
| `PI`                       | La constante 3.14159…; una variable tuya con el mismo nombre la oculta |

`aleatorio` usa una semilla por ejecución: con la misma semilla, el programa da exactamente los mismos números. `run`
regresa la semilla que usó en `seed`, y se puede fijar con la opción `seed`.

```codexivo
variable dado = aleatorio(1, 6);
imprimir("Salió", dado);
imprimir(piso(7 / 2), techo(7 / 2), raíz(16));
```

### Texto

Ninguno cambia el texto original (los textos no cambian nunca): todos regresan un valor nuevo.

| Procedimiento                                    | Qué hace                                                                                |
| ------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `mayúsculas(t)`, `minúsculas(t)`                 | El mismo texto en mayúsculas o en minúsculas                                            |
| `recortar(t)`                                    | Sin espacios ni saltos de línea al principio y al final                                 |
| `dividir(t, separador)`                          | Lista con los pedazos de `t` entre cada separador                                       |
| `unir(lista, separador)`                         | Un texto con los elementos de la lista separados por `separador`                        |
| `reemplazar(t, buscar, poner)`                   | Cambia cada aparición de `buscar` por `poner`                                           |
| `contiene(t, parte)`                             | `verdadero` si `parte` aparece en `t`                                                   |
| `empieza_con(t, parte)`, `termina_con(t, parte)` | Si `t` empieza o termina con `parte`                                                    |
| `posición_de(t, parte)`                          | Dónde empieza la primera aparición de `parte`, o `-1` si no está                        |
| `subtexto(t, inicio, fin)`                       | Los caracteres de `inicio` hasta **antes** de `fin`: `subtexto("hola", 1, 3)` es `"ol"` |
| `caracteres(t)`                                  | Lista con cada carácter                                                                 |
| `invertir(t)`                                    | El texto al revés                                                                       |
| `código_de(c)`, `carácter_de(n)`                 | El código Unicode de un carácter, y el carácter de un código                            |

```codexivo
variable frase = "  El sol sale  ";
variable palabras = dividir(recortar(frase), " ");
imprimir(unir(palabras, "-"));
imprimir(mayúsculas(palabras[1]), contiene(frase, "sol"), posición_de(frase, "sale"));
```

### Listas

Regla: **`agregar`, `insertar`, `quitar` (y sus variantes) y `vaciar` cambian la lista; todo lo demás regresa un valor
nuevo.** Los índices siguen la misma convención que `[ ]`: desde 0, y los negativos cuentan desde el final.

| Procedimiento                                   | Qué hace                                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------------------ |
| `agregar(lista, x)`                             | Agrega al final                                                                |
| `insertar(lista, i, x)`                         | Pone `x` en la posición `i` y recorre los demás                                |
| `quitar(lista, i)`                              | Quita el elemento en la posición `i` y lo regresa                              |
| `quitar_último(lista)`, `quitar_primero(lista)` | Quitan el último o el primero y lo regresan                                    |
| `vaciar(lista)`                                 | Quita todos los elementos (también sirve con un diccionario)                   |
| `primero(lista)`, `último(lista)`               | Primer y último elemento                                                       |
| `contiene(lista, x)`, `posición_de(lista, x)`   | Si `x` está (comparando por valor) y en qué posición, o `-1`                   |
| `rango(a, b, paso?)`                            | Lista de `a` a `b`, **incluyendo** `b`; con `paso` negativo cuenta hacia abajo |
| `índices(lista)`                                | Las posiciones válidas: `rango(0, longitud(lista) - 1)`                        |
| `rebanar(lista, inicio, fin)`                   | Los elementos de `inicio` hasta **antes** de `fin`                             |
| `invertir(lista)`, `copiar(lista)`              | Una lista nueva al revés, o igual                                              |
| `ordenar(lista)`                                | Una lista nueva ordenada; todos números o todos textos                         |
| `sumar(lista)`                                  | La suma de sus números                                                         |
| `lista_de(n, valor)`                            | Lista con `n` copias de `valor`                                                |
| `matriz(filas, columnas, valor)`                | Lista de filas, cada una con `columnas` copias de `valor`                      |

`lista_de` y `matriz` copian el valor en cada casilla, así cambiar una no cambia las demás:

```codexivo
variable tablero = matriz(3, 3, ".");
tablero[1][1] = "X";
para_cada fila en tablero {
  imprimir(unir(fila, " "));
}

variable números = [5, 3, 8];
insertar(números, 0, 1);
imprimir(ordenar(números), sumar(números), quitar_último(números), números);
```

### Diccionarios

| Procedimiento             | Qué hace                                                          |
| ------------------------- | ----------------------------------------------------------------- |
| `claves(d)`, `valores(d)` | Listas nuevas con las claves o los valores, en orden de inserción |
| `tiene(d, clave)`         | `verdadero` si el diccionario tiene esa clave                     |
| `quitar(d, clave)`        | Quita la clave y regresa su valor (cambia el diccionario)         |
| `copiar(d)`               | Un diccionario nuevo con las mismas claves y valores              |

## Errores

Cada error dice de qué tipo es (léxico, sintaxis, ejecución o límite), qué pasó, dónde y, casi siempre, una pista:

```
Error de ejecución en la línea 2, columna 5: No se puede dividir entre cero.
Pista: Revisa que el divisor no valga 0 antes de dividir.
```

## Límites

Para que un error nunca congele la página, la ejecución se detiene con un error de límite al superar 10 000 000 de
operaciones, 10 000 llamadas anidadas o 1 000 000 de caracteres impresos. Los tres se pueden configurar.

## Operaciones

Cada operación básica (leer una variable, poner un valor, sumar, comparar, asignar, decidir, llamar) cuesta 1. Los
procedimientos de la biblioteca cuestan según el trabajo que hacen, con `n` el tamaño de su primer argumento:

| Costo          | Procedimientos                                                                                                                                                                                                                                                        |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `n · ⌈log₂ n⌉` | `ordenar`                                                                                                                                                                                                                                                             |
| `n`            | `contiene`, `posición_de`, `copiar`, `invertir`, `sumar`, `insertar`, `quitar`, `quitar_primero`, `desencolar`, `claves`, `valores`, `índices`, `máximo`, `mínimo`, `mapear`, `filtrar`, `reducir`, `alguno`, `todos`, `buscar`, y los de texto que recorren el texto |
| lo que crean   | `rango`, `rebanar`, `subtexto`, `lista_de`, `matriz`                                                                                                                                                                                                                  |
| 1              | todos los demás                                                                                                                                                                                                                                                       |

Lo que hace el procedimiento que recibe `mapear` (y los demás) se cuenta aparte, como cualquier código. El mismo programa con
la misma entrada siempre da el mismo número de operaciones, y los retos lo usan en lugar del tiempo.
