# Historial de cambios

## 0.2.0

- Núcleo reescrito como lexer, parser, compilador y máquina reanudable (#23).
- Ejecución paso a paso, eventos, snapshots, límites deterministas y entrada interactiva.
- API de biblioteca para navegador y Bun, con tipos publicados como fuentes TypeScript.
- Comando `codexivo` instalable desde npm (requiere Bun).
- Ejecutables autónomos para Linux (glibc y musl), macOS y Windows, en x64 y ARM64.
- Publicación desde tags `v*` mediante GitHub Actions, con OIDC, provenance y artefactos en GitHub Releases.

Esta versión reemplaza el núcleo anterior. La sintaxis implementada se describe en
[`docs/lenguaje.md`](./docs/lenguaje.md).
