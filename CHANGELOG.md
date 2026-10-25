# Historial de cambios

Cada versión se genera automáticamente al publicarla, a partir de los commits convencionales desde la versión anterior
(`bun run changelog`). Las reglas para que un commit llegue bien aquí están en
[`AGENTS.md`](./AGENTS.md#historial-de-cambios). Para añadir una introducción escrita a mano a la próxima versión,
escríbela bajo un encabezado `## Sin publicar`.

## 1.0.2 (2026-10-25)

### Novedades

- Análisis estático para el editor (diagnósticos, símbolos y diagrama en vivo) ([#54](https://github.com/UrielCuriel/codexivo/pull/54)).
- Avisos del linter (sin uso, código inalcanzable, condiciones y literales) ([#54](https://github.com/UrielCuriel/codexivo/pull/54)).

## 1.0.1 (2026-10-22)

### Novedades

- Traza del parser para ver cómo se construye el árbol ([#51](https://github.com/UrielCuriel/codexivo/pull/51)).

## 1.0.0

Primera versión completa del lenguaje según la [especificación v1](./docs/especificacion-v1.md) (#24). Todo lo que funciona
está en [`docs/lenguaje.md`](./docs/lenguaje.md).

### Lenguaje

- **Nivel principiante** (#25, #43): `para i desde a hasta b con_paso p`, `repetir n veces`, `constante`, `div`, `mod`
  (`%`), `^`, `%=`, `i++`/`i--` como sentencias, comparaciones en palabras (`es_igual_a`, `es_menor_que`…), `1_000_000`
  y `PI`.
- **Nivel intermedio** (#26, #27): procedimientos con nombre (se pueden usar antes de declararse), `para_cada`, `romper`,
  `continuar`, asignación por índice (`lista[i] = …`), diccionarios con `d["clave"]` y `d.campo`, y
  `para_cada clave, valor en d`.
- **Dominios** (#19): `dominio nombre { … }` agrupa declaraciones en un espacio de nombres que se usa con `.`.
- **Biblioteca** (#28, #29): texto, listas, diccionarios, matemáticas con `aleatorio` de semilla fija, `afirmar`,
  `mapear`/`filtrar`/`reducir`/`alguno`/`todos`/`buscar`, `ordenar` con comparador estable, pilas y colas.
- **Modo mundo** (#30): el robot de Karel, con mundos en JSON, eventos `robot` y objetivos de reto (`checkGoal`).

### Para el sitio

- Costo por operación de la biblioteca en una sola tabla (`n`, `n · ⌈log₂ n⌉`) (#29).
- `catalog`: palabras reservadas, operadores, biblioteca con ejemplos ejecutables y códigos de error como datos (#31).
- `flowGraph`: diagrama de flujo generado desde el AST, con los `nodeId` de los eventos (#32).
- `codexivo/worker`, `createSandbox` y `evaluarReto`: ejecución en Web Worker por tandas, retroceso por re-ejecución y
  retos estilo HackerRank y LeetCode (#33).

### Cambios que rompen compatibilidad

- Palabras reservadas nuevas: `constante`, `dominio`, `repetir`, `veces`, `desde`, `hasta`, `con_paso`, `para_cada`,
  `en`, `romper`, `continuar`, `mod`, `div` y las comparaciones en palabras ya no sirven como nombres.
- Sin `;`, el salto de línea termina la expresión: una línea que empieza con `-`, `(` o `[` ya no continúa la anterior,
  y una expresión partida antes de un operador es un error.
- `Snapshot.heap` acepta también diccionarios (`{ entries }`) y dominios (`{ domain, members }`).
- `ordenar` deja de ser un nativo (`natives.ordenar`) y pasa a la biblioteca escrita en Codexivo.
- Las llamadas a la biblioteca cobran su costo en operaciones, así que la cuenta de operaciones de los programas cambia.

## 0.2.0

- Núcleo reescrito como lexer, parser, compilador y máquina reanudable (#23).
- Ejecución paso a paso, eventos, snapshots, límites deterministas y entrada interactiva.
- API de biblioteca para navegador y Bun, con tipos publicados como fuentes TypeScript.
- Comando `codexivo` instalable desde npm como `@codexivo/cli`, separado de la biblioteca web `codexivo`, que ejecuta el binario nativo del sistema sin depender de Node.js ni Bun durante la ejecución.
- Ejecutables autónomos para Linux (glibc y musl), macOS y Windows, en x64 y ARM64.
- Publicación desde tags `v*` mediante GitHub Actions, con OIDC, provenance y artefactos en GitHub Releases.
- Formato integrado con `bun fmt` y configuración en `bunfig.toml`.
- Incremento automático `patch` con `bun pm version` al integrar cambios en `main`, y publicación manual `patch`/`minor`/`major`.

Esta versión reemplaza el núcleo anterior. La sintaxis implementada se describe en
[`docs/lenguaje.md`](./docs/lenguaje.md).
