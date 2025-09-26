# Repository Guidelines

## Project Structure & Module Organization
Core interpreter logic lives in `src/`, organized by language phase: `lexer.ts` handles tokenization, `parser.ts` builds AST nodes from `ast.ts`, and `evaluator.ts` executes nodes with objects from `object.ts` and built-ins in `builtins.ts`. `src/index.ts` is the library entry point, while `src/cli.ts` and `src/repl.ts` power the development REPL. Place runtime inspections in `src/inspector.ts` and errors in `errors.ts`. Tests mirror these modules under `src/tests/*.spec.ts`. Build outputs land in `dist/` after running the bundler; keep docs such as `README.md` at the repo root.

## Development Environment
Install Bun 1.2.14 (see `package.json`'s `packageManager`) and Node type definitions. Run commands from the repo root. Generated artifacts should stay under `dist/`; clean them with `bun run clean` before committing.

## Build, Test, and Development Commands
- `bun run repl` launches the interpreter REPL using `src/cli.ts`.
- `bun test` runs the Bun test runner against every `*.spec.ts` in `src/tests`.
- `bun run bundle` produces the browser-ready bundle in `dist/`.
- `bun run types` emits declaration files via `tsc`.
- `bun run build` sequences clean → bundle → types for release output.

## Coding Style & Naming Conventions
Use 2-space indentation and keep TypeScript strictness by leaning on type annotations for public APIs. Export named symbols from modules; class-like constructs (e.g., `Parser`, `Lexer`) stay `PascalCase`, functions and variables `camelCase`, enums `SCREAMING_SNAKE_CASE`. Prefer short, immutable helpers over shared state; reuse existing token and AST factories. Run `bun run types` before submitting to catch drift between implementation and declarations.

## Testing Guidelines
Follow the existing Bun test style: colocate new specs under `src/tests`, mirror the module under test, and describe behavior (e.g., `describe('parser')`). Include both success paths and error expectations, especially for new grammar forms. Run `bun test src/tests/<file>.spec.ts` while iterating, and rerun `bun test` before opening a pull request.

## Commit & Pull Request Guidelines
Use imperative, conventional prefixes (`feat:`, `fix:`, `docs:`, `chore:`) consistent with the current history. Include a focused scope in the subject and note user-facing impacts in the body when necessary. Pull requests should summarise changes, list validation commands (`bun test`, `bun run build`), link related issues, and attach screenshots or REPL transcripts when illustrating language behavior.
