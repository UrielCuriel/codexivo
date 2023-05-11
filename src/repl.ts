import { Lexer } from './lexer';
import { Token, TokenType } from './token';
import * as readline from 'readline';

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
  while (true) {
    const input = (await prompt('>> ')) ?? '';
    if (input === 'salir') {
      console.log('Adios!');
      rl.close();
      break;
    }
    const lexer = new Lexer(input);
    let token = lexer.nextToken();
    while (token.type !== TokenType.EOF) {
      console.log(token.toString());
      token = lexer.nextToken();
    }
  }
  return;
}
