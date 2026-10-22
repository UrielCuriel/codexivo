# Repository Guidelines

Codexivo is an educational programming language in Spanish. This repo holds the language only (interpreter, REPL, tests,
docs); the website and sandbox live in a separate repository and consume this package.

## Source of truth

- `docs/especificacion-v1.md` — the target design of the language. New features follow it; if a change contradicts it, update
  the spec in the same PR and say so.
- `docs/lenguaje.md` — what works **today**. Every example in it must run. Update it with every user-facing change.

## Project structure

Pipeline: `tokenize → parse → compile → Machine`.

- `src/syntax/` — `token.ts` (token types, `Span`/`Position`, keywords), `lexer.ts`, `ast.ts` (plain-object AST with
  `kind`, `id`, `span`), `parser.ts` (Pratt parser with error recovery).
- `src/runtime/` — `compiler.ts` (AST → stack-machine instructions), `machine.ts` (pausable VM with its own call stack,
  limits, events and snapshots), `values.ts`, `builtins.ts` (standard library), `suggest.ts`.
- `src/errors.ts` — `CodexivoError` and `formatError`.
- `src/engine.ts` — `run`, `prepare`, `Session`. `src/index.ts` is the public API.
- `src/cli.ts` — REPL and file runner (Bun APIs only, no `node:` imports).
- `install.cjs` — npm postinstall; copies the matching native optional dependency to `bin/codexivo.exe`.
- `bin/codexivo.exe` — packaging placeholder, replaced by the native executable at install time. The `.exe` filename also works on Unix. No JS launcher remains at runtime.
- `packages/*` — native npm packages filtered by OS, CPU and libc. Their versions track the root via the version lifecycle.
- `tests/*.test.ts` — Bun tests, one file per area.

## Commands

- `bun test` — run the test suite.
- `bun fmt` / `bun fmt --check` — format the repository / check formatting without writing.
- `bun check` — type check (replaces `tsc`; TypeScript is not a dependency).
- `bun run repl` — interactive REPL. `bun run src/cli.ts file.cdx` runs a file.
- `bun run build` — browser ESM bundle and standalone CLI for the host platform. Types ship as the `.ts` sources in `src/`.
- `bun run build:binary [target]` — standalone executable for the host or a Bun cross-compilation target.
- `bun run build:binaries` — all eight OS/architecture/libc targets in `dist/binaries/`.
- `bun run test:package` — tarball installation, browser/Vite consumer and CLI smoke tests (needs Node.js 24).

Run `bun fmt --check`, `bun test` and `bun check` before every push.

## Conventions

- Code (identifiers, comments about internals) in English or Spanish as the surrounding file does; **everything a learner sees
  is in Spanish** with correct accents: error messages, hints, docs, built-in names.
- Every error has a stable `code`, a `message` that says what happened and, when possible, a `hint` that says what to check.
  Never let a JavaScript exception escape for a user mistake.
- Every AST node and token keeps its `span`; every instruction keeps its node. Visualizations depend on it.
- The machine must stay deterministic: same program + same input ⇒ same output, same operation count.
- Built-in names with accents are canonical; the unaccented alias is registered automatically.
- 2-space indentation, single quotes, trailing commas (see `[fmt]` in `bunfig.toml`).

## Tests

Describe behavior, cover the success path and the error (`code`, and the hint when it matters). New grammar needs parser tests
(precedence/shape) and machine tests (semantics).

## Commits and PRs

Conventional prefixes (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`). PRs list what was validated (`bun test`,
`bun check`, `bun run build`) and note any behavior change for learners.
