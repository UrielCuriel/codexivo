# Codexivo

Bienvenido al proyecto de nuestro nuevo y emocionante lenguaje de programación: Codexivo. Durante las últimas semanas, he estado inmerso en esta apasionante tarea de crear una herramienta que facilite el aprendizaje de la programación. En un principio, mi objetivo era desarrollar un intérprete de pseudocódigo con una visualización de diagrama de flujo integrada, pero a medida que investigaba, surgió una idea aún más emocionante: crear un "lenguaje de programación" similar al que solía utilizar en mi infancia con el emulador de robot llamado Karel.

Inspirado por esta idea, me embarqué en este proyecto con la determinación de crear una plataforma que permita a los principiantes aprender sobre lógica, algoritmos básicos, bucles y mucho más. Para lograrlo, definí una serie de características clave que el lenguaje debía poseer:

1. **Simplicidad**: Con el aprendizaje en mente, decidí que nuestro lenguaje solo incluirá tipos de datos simples como números, cadenas y arreglos, y posiblemente diccionarios en el futuro.

2. **Verbalidad**: Para hacer el código más comprensible y legible, he optado por utilizar más palabras que símbolos en la sintaxis del lenguaje.

3. **En español**: Creo firmemente que el aprendizaje se facilita cuando se utiliza el idioma nativo, así que he elegido el español como el idioma principal de nuestro lenguaje. Incluso estoy considerando permitir el uso de la "ñ" y acentos dentro del código.

4. **Fácil acceso**: Quiero que nuestro lenguaje sea fácil de usar para todos, por lo que he diseñado una solución que se puede ejecutar directamente en un navegador, sin necesidad de instalaciones adicionales ni acceso a internet.

## Un ejemplo

```codexivo
// La suma de los números del 1 al 10
variable suma = 0;
para (variable i = 1; i <= 10; i += 1) {
  suma += i;
}
imprimir("La suma es", suma);
```

```codexivo
variable clasificar = procedimiento(edad) {
  si (edad >= 18) {
    regresa "adulto";
  } pero_si (edad >= 13) {
    regresa "adolescente";
  } si_no {
    regresa "niño";
  }
};
imprimir(clasificar(16));
```

Lo que funciona hoy está en [`docs/lenguaje.md`](./docs/lenguaje.md), y todos sus ejemplos se ejecutan tal cual. Hacia dónde va
el lenguaje, nivel por nivel, está en la [especificación v1](./docs/especificacion-v1.md).

## Cómo usarlo

Necesitas [Bun](https://bun.com) 1.4.4 o más reciente.

```sh
bun install
bun run repl                      # REPL interactivo
bun run src/cli.ts programa.cdx   # ejecutar un archivo; la entrada estándar alimenta a leer()
```

Como biblioteca, en el navegador o en Bun (una vez publicada la versión):

```sh
npm install codexivo@0.2.0
```

```ts
import { run } from 'codexivo';

const resultado = run('imprimir("Hola desde Codexivo");');
console.log(resultado.output); // "Hola desde Codexivo\n"
```

El paquete incluye un bundle ESM compatible con navegador y los tipos como fuentes TypeScript. Importar la biblioteca no
inicia el REPL ni necesita Bun. Para usar el comando desde npm necesitas Bun 1.4.4 o posterior:

```sh
npm install --global codexivo@0.2.0
codexivo                         # REPL
codexivo programa.cdx            # ejecutar un archivo
```

También puedes descargar un ejecutable autónomo desde [Releases](https://github.com/UrielCuriel/codexivo/releases), sin
instalar Node.js ni Bun. Hay versiones x64 y ARM64 para Linux, macOS y Windows; Linux ofrece glibc y musl (Alpine).
En Linux y macOS, dale permiso de ejecución con `chmod +x codexivo-*` antes de usarlo.

```sh
./codexivo-linux-x64 programa.cdx
```

En Windows, por ejemplo: `.\codexivo-windows-x64.exe programa.cdx`.

El intérprete compila el programa a instrucciones para una máquina propia que se puede pausar, ejecutar paso a paso y que
reporta cada decisión, asignación y llamada. Eso es lo que permite visualizar cómo piensa un programa. Los detalles están en la
[arquitectura](./docs/arquitectura.md).

## Scripts

- `bun test` — pruebas.
- `bun check` — revisión de tipos.
- `bun run repl` — REPL.
- `bun run build` — biblioteca ESM para navegador y CLI para Bun en `dist/`.
- `bun run build:lib` / `bun run build:cli` — construir cada entrada por separado.
- `bun run build:binary` — ejecutable autónomo para el sistema actual en `dist/binaries/`.
- `bun run build:binary bun-windows-x64` — compilación cruzada para un destino específico.
- `bun run build:binaries` — los ocho destinos de Linux/macOS/Windows, x64/ARM64.
- `bun run test:package` — empaquetar e instalar en un consumidor aislado, compilar con Vite y probar el CLI.

Al integrar cambios en `main` (por merge o push), el workflow incrementa automáticamente la versión con `bun pm version patch`,
crea el commit y el tag y continúa con las validaciones y la publicación en la misma ejecución. El commit automático no
dispara otra publicación. El workflow toma el estado más reciente de `main`, por lo que merges muy próximos pueden agruparse.
Desde **Actions → Publicar → Run workflow**, en `main`, se puede elegir `patch`, `minor` o `major` para una publicación manual.

También se admiten tags `v*` creados manualmente: deben coincidir con `package.json` y no incrementan la versión otra vez.
Todas las compilaciones usan el SHA del commit de la versión. Las versiones preliminares se publican con el dist-tag `next`;
las estables, con `latest`. Los ejecutables y sus sumas SHA-256 se adjuntan a la release. Los binarios no están firmados ni
notarizados.

## Qué sigue

- [x] Lexer, parser y máquina con posiciones exactas, errores con pistas y límites deterministas
- [x] Ejecución paso a paso, eventos y fotografías del estado para visualización
- [x] `imprimir`, `leer`, `leer_número`, comentarios, `nulo`
- [ ] Nivel principiante de la v1: `repetir … veces`, `++`/`--`, `mod`/`div`, operadores en palabras, `constante`
- [ ] Nivel intermedio: procedimientos con nombre, `para_cada`, `romper`/`continuar`, diccionarios, más biblioteca
- [ ] Nivel avanzado: procedimientos como valores en la biblioteca, pilas y colas
- [ ] Modo mundo (Karel)
- [ ] Sitio con documentación y sandbox: `codexivo.urielcuriel.dev`

## Cómo contribuir

- Reportando errores o problemas
- Sugiriendo nuevas características
- Contribuyendo con código (lee [`AGENTS.md`](./AGENTS.md))
- Mejorando la documentación
- Compartiendo el proyecto con otras personas

## ¿Quién está detrás de este proyecto?

Mi nombre es [Uriel Curiel](https://twitter.com/UrielCuriel), soy un desarrollador de software con más de 8 años de
experiencia en el desarrollo de aplicaciones web y móviles. Me apasiona la tecnología y el aprendizaje, y me encanta compartir mis conocimientos con los demás. Puedes encontrarme en [Twitter](https://twitter.com/UrielCuriel) y [LinkedIn](https://www.linkedin.com/in/urielcuriel/).

Puedes seguir las actualizaciones de este proyecto en mi blog [urielcuriel.dev](https://urielcuriel.dev/blog), en la serie
«Construyendo Codexivo».
