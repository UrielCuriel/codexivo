import { Lexer } from './lexer';
import { Token, TokenType } from './token';
import { Program } from './ast';
import * as readline from 'readline';
import { Parser } from './parser';
import { inspect } from './inspector';
import { evaluate } from './evaluator';
import { Environment } from './object';

const EOF_TOKEN = new Token(TokenType.EOF, '');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function prompt(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    rl.question(question, answer => {
      resolve(answer);
    });
  });
}

/**
 * REPL (Read-Eval-Print-Loop) para el lenguaje Codexivo
 */
export async function start_repl() {
  const scanned: string[] = [];
  while (true) {
    const input = (await prompt('>> ')) ?? '';
    if (input === 'salir();') {
      console.log('Adios!');
      rl.close();
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
