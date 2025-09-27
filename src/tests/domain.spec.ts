import { describe, expect, it } from 'bun:test';
import { Lexer } from '../lexer';
import { Parser } from '../parser';
import { evaluate } from '../evaluator';
import { Environment, Number as NumberObj, Domain as DomainObj } from '../object';

describe('domain functionality', () => {
  function testEval(input: string) {
    const lexer = new Lexer(input);
    const parser = new Parser(lexer);
    const program = parser.parseProgram();
    
    if (parser.errors.length > 0) {
      throw new Error(`Parser errors: ${parser.errors.join(', ')}`);
    }
    
    const env = new Environment();
    return evaluate(program, env);
  }

  it('should parse and evaluate domain declaration', () => {
    const input = `dominio calculadora {
      variable suma = procedimiento(a,b) { regresa a + b; };
    }`;
    
    const result = testEval(input);
    expect(result).toBeInstanceOf(DomainObj);
    expect(result.inspect()).toBe('dominio calculadora');
  });

  it('should access domain members', () => {
    const input = `
    dominio calculadora {
      variable suma = procedimiento(a,b) { regresa a + b; };
    }
    calculadora.suma(1, 3)
    `;
    
    const result = testEval(input);
    expect(result).toBeInstanceOf(NumberObj);
    expect((result as NumberObj).value).toBe(4);
  });

  it('should handle the exact example from the issue', () => {
    const input = `dominio calculadora {
      variable suma = procedimiento(a,b){
         variable total = a+b;
         regresa total;
       }
    }

    variable sumado = calculadora.suma(1,3);`;
    
    const result = testEval(input);
    expect(result).toBeInstanceOf(NumberObj);
    expect((result as NumberObj).value).toBe(4);
  });

  it('should handle domains with multiple members', () => {
    const input = `
    dominio matematica {
      variable suma = procedimiento(a,b) { regresa a + b; };
      variable resta = procedimiento(a,b) { regresa a - b; };
      variable pi = 3.14159;
    }
    matematica.suma(10, 5)
    `;
    
    const result = testEval(input);
    expect(result).toBeInstanceOf(NumberObj);
    expect((result as NumberObj).value).toBe(15);
  });

  it('should access constants from domains', () => {
    const input = `
    dominio matematica {
      variable pi = 3.14159;
    }
    matematica.pi
    `;
    
    const result = testEval(input);
    expect(result).toBeInstanceOf(NumberObj);
    expect((result as NumberObj).value).toBe(3.14159);
  });

  it('should handle error when accessing non-existent member', () => {
    const input = `
    dominio calculadora {
      variable suma = procedimiento(a,b) { regresa a + b; };
    }
    calculadora.resta(5, 2)
    `;
    
    const result = testEval(input);
    expect(result.inspect()).toContain("el dominio 'calculadora' no tiene el miembro 'resta'");
  });

  it('should handle error when accessing member on non-domain', () => {
    const input = `
    variable numero = 42;
    numero.valor
    `;
    
    const result = testEval(input);
    expect(result.inspect()).toContain("no se puede acceder al miembro 'valor' en un objeto de tipo NUMBER");
  });
});