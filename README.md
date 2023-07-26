# Codexivo

Bienvenido al proyecto de nuestro nuevo y emocionante lenguaje de programación: Codexivo. Durante las últimas semanas, he estado inmerso en esta apasionante tarea de crear una herramienta que facilite el aprendizaje de la programación. En un principio, mi objetivo era desarrollar un intérprete de pseudocódigo con una visualización de diagrama de flujo integrada, pero a medida que investigaba, surgió una idea aún más emocionante: crear un "lenguaje de programación" similar al que solía utilizar en mi infancia con el emulador de robot llamado Karel.

Inspirado por esta idea, me embarqué en este proyecto con la determinación de crear una plataforma que permita a los principiantes aprender sobre lógica, algoritmos básicos, bucles y mucho más. Para lograrlo, definí una serie de características clave que el lenguaje debía poseer:

1. **Simplicidad**: Con el aprendizaje en mente, decidí que nuestro lenguaje solo incluirá tipos de datos simples como números, cadenas y arreglos, y posiblemente diccionarios en el futuro.

2. **Verbalidad**: Para hacer el código más comprensible y legible, he optado por utilizar más palabras que símbolos en la sintaxis del lenguaje.

3. **En español**: Creo firmemente que el aprendizaje se facilita cuando se utiliza el idioma nativo, así que he elegido el español como el idioma principal de nuestro lenguaje. Incluso estoy considerando permitir el uso de la "ñ" y acentos dentro del código.

4. **Fácil acceso**: Quiero que nuestro lenguaje sea fácil de usar para todos, por lo que he diseñado una solución que se puede ejecutar directamente en un navegador, sin necesidad de instalaciones adicionales ni acceso a internet.

Estoy entusiasmado por compartir el progreso de este proyecto y las futuras mejoras que vendrán. Espero que Codexivo se convierta en una herramienta útil y accesible para quienes deseen aventurarse en el mundo de la programación de manera sencilla y efectiva. ¡Únete a esta emocionante travesía hacia el aprendizaje de la programación de forma amigable y en español.

## ¿Cómo funciona?

Actualmente se puede acceder a Codexivo a través del REPL incluido en este repositorio. Para ejecutarlo, simplemente ejecute el comando `npm run repl` o `node .` en la carpeta raíz del proyecto. Esto iniciará el REPL y le permitirá ingresar código Codexivo para que se ejecute inmediatamente. Para salir del REPL, simplemente escriba `salir()` y presione enter.

Se está trabajando en una versión web de Codexivo que se ejecutará directamente en el navegador. Esta versión incluirá una interfaz de usuario más amigable y una visualización de diagrama de flujo integrada.

## ¿Qué incluye el lenguaje?

Codexivo es un lenguaje de programación de alto nivel que incluye las siguientes características:

- Sintaxis en español basada en javascript
```
// Definición de variables
variable n = 10;
variable m = 20;
variable q = "hola mundo";
// Definición de procedimientos
procedimiento suma(a, b) {
  regresa a + b;
}
procedimiento resta(a, b) {
  regresa a - b;
}
procedimiento multiplicación(a, b) {
  regresa a * b;
}
procedimiento division(a, b) {
  regresa a / b;
}
// Llamadas a procedimientos
suma(n, m);
resta(n, m);
// Bucle "para" con condición y cuerpo de bucle
para (variable i = 0; i < 10; i = i + 1) {
    multiplicación(n, m);
}
// Bucle "hacer-mientras" con condición y cuerpo de bucle
hacer {
  division(n, m);
} hasta_que (n > 0);
```
- Tipos de datos simples: números, cadenas, booleanos 
```
variable n = 10;
variable m = 20;
variable q = "hola mundo";
variable r = verdadero;
```
- Operadores aritméticos: suma, resta, multiplicación, división, módulo, incremento y decremento
```
variable n = 10;
variable m = 20;

n + m;
n - m;
n * m;
n / m;
n % m;
n++;
n--;
```

- Operadores de comparación: igualdad, desigualdad, mayor que, menor que, mayor o igual que, menor o igual que
```
variable n = 10;
variable m = 20;

n == m;
n != m;
n > m;
n < m;
n >= m;
n <= m;
```

- Operadores lógicos: y, o, no
```
variable n = 10;
variable m = 20;

n == m y n > m;
n == m o n > m;
no n == m;
```

- Estructuras de control: si, si-sino, mientras, hacer-mientras, para
```
variable n = 10;
variable m = 20;

si (n == m) {
  // ...
}

si (n == m) {
  // ...
} sino {
  // ...
}

mientras (n < m) {
  // ...
}

hacer {
  // ...
} hasta_que (n > 0);

para (variable i = 0; i < 10; i = i + 1) {
  // ...
}
```


## ¿Qué sigue?

A continuación se muestra una lista de las características que se implementarán en el futuro:

- [ ] Tipos de datos: arreglos, diccionarios
- [ ] Operadores: concatenación de cadenas, operadores de asignación
- [ ] Funciones Built-in: imprimir, leer, longitud, tipo, etc.
- [ ] Documentación
- [ ] Sitio web

Hasta el momento estas son las características que se han implementado en el lenguaje, pero se espera que en el futuro se agreguen más características y funcionalidades. Siéntase libre de contribuir a este proyecto y ayudar a que Codexivo sea una herramienta útil para todos.

## ¿Cómo contribuir?

Si desea contribuir a este proyecto, puede hacerlo de las siguientes maneras:

- Reportando errores o problemas
- Sugerir nuevas características
- Contribuyendo con código
- Mejorando la documentación
- Compartiendo el proyecto con otras personas

## ¿Quién está detrás de este proyecto?

Mi nombre es [Uriel Curiel](https://twitter.com/UrielCuriel), soy un desarrollador de software con más de 8 años de
experiencia en el desarrollo de aplicaciones web y móviles. Me apasiona la tecnología y el aprendizaje, y me encanta compartir mis conocimientos con los demás. Puedes encontrarme en [Twitter](https://twitter.com/UrielCuriel) y [LinkedIn](https://www.linkedin.com/in/urielcuriel/).

Puedes seguir las actualizaciones de este proyecto en mi blog [urielcuriel.com](https://urielcuriel.dev/blog).
