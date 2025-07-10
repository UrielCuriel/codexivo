import { Lexer } from '../core/lexer';
import { Parser } from '../core/parser';
import { evaluate } from '../core/evaluator';
import { Environment } from '../core/object';

/**
 * REPL (Read-Eval-Print-Loop) para el lenguaje Codexivo
 */
export async function start_repl() {
  const scanned: string[] = [];
  while (true) {
    const input = prompt('>> ') ?? '';
    if (input === 'salir();') {
      console.log('Adios!');
      break;
    }
    scanned.push(input);
    const lexer = new Lexer(scanned.join('\n'));
    const parser = new Parser(lexer);
    const program = parser.parseProgram();
    const env = new Environment();
    if (parser.errors.length > 0) {
      printParserErrors(parser.errors);
      continue;
    }
    const evaluated = evaluate(program, env);
    if (evaluated) {
      console.log(evaluated.inspect());
    }
  }
  return;
}

function printParserErrors(errors: string[]) {
  errors.forEach(error => console.log(error));
}
