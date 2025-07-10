import { expect, test,describe } from 'bun:test';
import { Lexer } from '../src/core/lexer';
import { Parser } from '../src/core/parser';

describe('Parser Error Detection', () => {
  test('should detect invalid variable declaration keyword', () => {
    const input = 'constante q = 10;';
    const lexer = new Lexer(input);
    const parser = new Parser(lexer);

    parser.parseProgram();

    expect(parser.errors).toContain("'constante' no es una palabra clave válida para declarar variables. ¿Quisiste decir 'variable'?");
  });

  test('should detect const as invalid keyword', () => {
    const input = 'const x = 20;';
    const lexer = new Lexer(input);
    const parser = new Parser(lexer);
    
    parser.parseProgram();
    
    expect(parser.errors).toContain("'const' no es una palabra clave válida para declarar variables. ¿Quisiste decir 'variable'?");
  });

  test('should detect let as invalid keyword', () => {
    const input = 'let z = 30;';
    const lexer = new Lexer(input);
    const parser = new Parser(lexer);
    
    parser.parseProgram();
    
    expect(parser.errors).toContain("'let' no es una palabra clave válida para declarar variables. ¿Quisiste decir 'variable'?");
  });

  test('should parse valid variable declaration correctly', () => {
    const input = 'variable x = 5;';
    const lexer = new Lexer(input);
    const parser = new Parser(lexer);
    
    const program = parser.parseProgram();
    
    expect(parser.errors.length).toBe(0);
    expect(program.statements.length).toBe(1);
  });
});
