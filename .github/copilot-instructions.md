# Codexivo Interpreter - AI Coding Guidelines

## Architecture Overview
Codexivo is a Spanish-based programming language interpreter with a classic compiler pipeline:
- **Lexer** (`src/lexer.ts`): Tokenizes Spanish keywords and symbols
- **Parser** (`src/parser.ts`): Builds AST using Pratt parsing with precedence
- **Evaluator** (`src/evaluator.ts`): Executes AST nodes in an environment-based runtime
- **Engine** (`src/engine.ts`): Orchestrates parsing, AST serialization, and execution

Core data flows: Source → Tokens → AST → Runtime Objects. Use `CodexivoEngine` for high-level operations.

## Key Conventions
- **Spanish Keywords**: `variable`, `procedimiento`, `regresa`, `si`, `para`, `mientras`, `hacer`, `hasta_que`, `verdadero`/`falso`
- **Naming**: PascalCase classes (`Lexer`, `Parser`), camelCase functions/variables, SCREAMING_SNAKE_CASE enums
- **Indentation**: 2 spaces, strict TypeScript with Node types
- **Error Handling**: Spanish error messages via `newError()` in `src/errors.ts`

## Development Workflow
- **REPL Testing**: `bun run repl` for interactive testing
- **Unit Tests**: `bun test` runs Bun tests in `src/tests/*.spec.ts`
- **Build**: `bun run build` (clean → bundle → types) outputs to `dist/`
- **Browser Bundle**: `bun run bundle` creates browser-compatible JS

## Implementation Patterns
- **AST Nodes**: Extend `Statement` or `Expression`, implement `tokenLiteral()` and `toString()`
- **Runtime Objects**: Implement `Object` interface with `type` and `inspect()` methods
- **Parser Extensions**: Register prefix/infix parse functions in `Parser` constructor
- **Evaluator Extensions**: Add cases in `evaluate()` switch using `instanceof` checks
- **Built-ins**: Add to `src/builtins.ts` dictionary, validate arguments in TypeScript

## Testing Approach
Mirror module structure in `src/tests/`. Use `testEval()` helper for end-to-end testing. Include both success and error cases. Run `bun test src/tests/<module>.spec.ts` during development.

## Common Integration Points
- **Environment**: Hierarchical scopes in `src/object.ts`, outer references for closures
- **Tracer**: Enable with `{ trace: true }` in `engine.run()` for step-through debugging
- **Serialization**: Use `astSerializer.ts` for AST visualization tools

## File Organization
- `src/index.ts`: Public API exports
- `src/cli.ts`/`src/repl.ts`: Development REPL
- `src/inspector.ts`: Runtime inspection utilities
- `docs/`: Architecture and language specs