import { bench, run } from "mitata";
import { Lexer } from "../src/core/lexer";
import { Parser } from "../src/core/parser";
import { evaluate } from "../src/core/evaluator";
import { Environment } from "../src/core/object";

const code = `
variable suma = 0;
para(variable i = 0; i < 100; i += 1) {
  suma = suma + i;
}
`;

bench("parse and evaluate simple loop", () => {
  const lexer = new Lexer(code);
  const parser = new Parser(lexer);
  const program = parser.parseProgram();
  const env = new Environment();
  evaluate(program, env);
});

run();
