import { describe, it, expect } from 'bun:test';
import * as ast from '../src/core/ast';
import { Token, TokenType } from '../src/core/token';
import { lookupIdentifier } from '../src/core/token';
import { evaluate } from '../src/core/evaluator';
import { Environment, Number as NumberObj, Boolean as BoolObj, Null, Return, Error as ErrorObj, Function as FnObj, String as StrObj, Builtin } from '../src/core/object';

// Helper to create simple tokens
const tok = (type: TokenType, lit: string) => new Token(type, lit, 1, 1);

describe('additional coverage', () => {
  it('covers AST toString methods', () => {
    const ident = new ast.Identifier(tok(TokenType.IDENT, 'x'), 'x');
    const num = new ast.Number(tok(TokenType.NUM, '1'), 1);
    const letStmt = new ast.LetStatement(tok(TokenType.LET, 'variable'), ident, num);
    const block = new ast.Block(tok(TokenType.LBRACE, '{'), [letStmt]);

    const program = new ast.Program([letStmt]);
    expect(program.tokenLiteral()).toBe('variable');
    expect(program.toString()).toBe('variable x = 1;');
    expect(program.inspect()).toContain('statements');
    expect(block.toString()).toBe('variable x = 1;');

    const ifExpr = new ast.If(tok(TokenType.IF, 'si'), ident, block);
    expect(ifExpr.toString()).toBe('si x variable x = 1;');
    const ifElse = new ast.If(tok(TokenType.IF, 'si'), ident, block, block);
    expect(ifElse.toString()).toBe('si x variable x = 1; si_no variable x = 1;');

    const whileExpr = new ast.While(tok(TokenType.WHILE, 'mientras'), ident, block);
    expect(whileExpr.toString()).toBe('mientras x variable x = 1;');

    const doWhile = new ast.DoWhile(tok(TokenType.DO, 'hacer'), ident, block);
    expect(doWhile.toString()).toBe('hacer variable x = 1; hasta_que x');

    const forExpr = new ast.For(tok(TokenType.FOR, 'para'), letStmt, ident, num, block);
    expect(forExpr.toString()).toBe('para variable x = 1; x 1 variable x = 1;');

    const func = new ast.Function(tok(TokenType.FUNCTION, 'procedimiento'), [ident], block);
    expect(func.toString()).toBe('procedimiento (x) variable x = 1;');

    const call = new ast.Call(tok(TokenType.LPAREN, '('), func, [num]);
    expect(call.toString()).toBe('procedimiento (x) variable x = 1;(1)');

    const str = new ast.StringLiteral(tok(TokenType.STRING, 'hola'), 'hola');
    expect(str.toString()).toBe('hola');

    const arr = new ast.ArrayLiteral(tok(TokenType.LBRACKET, '['), [num, num]);
    expect(arr.toString()).toBe('[1, 1]');

    const index = new ast.Index(tok(TokenType.LBRACKET, '['), ident, num);
    expect(index.toString()).toBe('x[1]');

    const token = new Token(TokenType.PLUS, '+');
    expect(token.toString()).toBe('Type: PLUS, Literal: +');

    // base Statement toString
    const stmt = new ast.Statement(tok(TokenType.LET, 'variable'));
    expect(stmt.toString()).toBe('variable');
  });

  it('covers Environment and object inspect methods', () => {
    const outer = new Environment();
    outer.set('a', new NumberObj(1));
    const env = new Environment(outer);
    env.set('b', new NumberObj(2));
    expect((env.get('a') as NumberObj).value).toBe(1);
    expect((env.get('b') as NumberObj).value).toBe(2);
    env.delete('b');
    expect(env.get('b')).toBeUndefined();

    expect(new NumberObj(3).inspect()).toBe('3');
    expect(new BoolObj(true).inspect()).toBe('verdadero');
    expect(new Null().inspect()).toBe('nulo');
    expect(new Null().type()).toBe('NULL');
    expect(new Return(new NumberObj(1)).inspect()).toBe('1');
    expect(new Return(new NumberObj(1)).type()).toBe('RETURN');
    expect(new ErrorObj('ups').inspect()).toBe('ERROR: ups');
    expect(new ErrorObj('ups').type()).toBe('ERROR');

    const fn = new FnObj([new ast.Identifier(tok(TokenType.IDENT,'x'),'x')], new ast.Block(tok(TokenType.LBRACE,'{'),[]), env);
    expect(fn.type()).toBe('FUNCTION');
    expect(fn.inspect()).toContain('procedimiento(');

    const builtin = new Builtin(() => new NumberObj(1));
    expect(builtin.type()).toBe('BUILTIN');
    expect(builtin.inspect()).toBe('builtin function');

    expect(new StrObj('foo').inspect()).toBe('foo');

    expect(lookupIdentifier('si')).toBe(TokenType.IF);
    expect(lookupIdentifier('foobar')).toBe(TokenType.IDENT);
  });

  it('evaluator additional branches', () => {
    const env = new Environment();
    // unknown node returns NULL
    const unknown = new ast.Expression(tok(TokenType.IDENT, 'u'));
    expect(evaluate(unknown, env)).toBeInstanceOf(Null);

    // call with non function
    const call = new ast.Call(tok(TokenType.LPAREN, '('), new ast.Number(tok(TokenType.NUM, '1'), 1), []);
    const res = evaluate(call, env);
    expect(res).toBeInstanceOf(ErrorObj);
    expect((res as ErrorObj).message).toContain('no es una función');

    // assertValue path
    const badNum = new ast.Number(tok(TokenType.NUM, ''), undefined as any);
    expect(() => evaluate(badNum, env)).toThrow();

    // assertNumber path
    const nanNum = new ast.Number(tok(TokenType.NUM, 'NaN'), NaN);
    expect(() => evaluate(nanNum, env)).toThrow();

    const boolLeft = new ast.BooleanLiteral(tok(TokenType.TRUE,'verdadero'), true);
    const boolRight = new ast.BooleanLiteral(tok(TokenType.FALSE,'falso'), false);
    const eqExpr = new ast.Infix(tok(TokenType.EQ,'=='), boolLeft, '==', boolLeft);
    expect((evaluate(eqExpr, env) as BoolObj).value).toBe(true);
    const neExpr = new ast.Infix(tok(TokenType.NEQ,'!='), boolLeft, '!=', boolRight);
    expect((evaluate(neExpr, env) as BoolObj).value).toBe(true);

    // ! with null via if expression
    const num2 = new ast.Number(tok(TokenType.NUM,'1'), 1);
    const ifExpr = new ast.If(
      tok(TokenType.IF, 'si'),
      new ast.BooleanLiteral(tok(TokenType.FALSE,'falso'), false),
      new ast.Block(
        tok(TokenType.LBRACE,'{'),
        [new ast.ExpressionStatement(tok(TokenType.NUM,'1'), num2)]
      )
    );
    const prefix = new ast.Prefix(tok(TokenType.BANG,'!'), '!', ifExpr);
    const boolRes = evaluate(prefix, env) as BoolObj;
    expect(boolRes.value).toBe(true);

    // reserved word identifier
    const reserved = new ast.Identifier(tok(TokenType.IDENT,'si'), 'si');
    const err = evaluate(reserved, env) as ErrorObj;
    expect(err.message).toContain('palabra reservada');

    // unknown operator with NULL values throws due to missing template
    const left = new ast.Expression(tok(TokenType.IDENT,'a'));
    const right = new ast.Expression(tok(TokenType.IDENT,'b'));
    const infixUnknown = new ast.Infix(tok(TokenType.PLUS,'+'), left, '+', right);
    expect(() => evaluate(infixUnknown, env)).toThrow();

    // number infix unknown operator
    const numLeft = new ast.Number(tok(TokenType.NUM,'1'), 1);
    const numRight = new ast.Number(tok(TokenType.NUM,'1'), 1);
    const infixBad = new ast.Infix(tok(TokenType.BANG,'^'), numLeft, '^', numRight);
    const errObj = evaluate(infixBad, env) as ErrorObj;
    expect(errObj.message).toContain('operador desconocido');

    // if expression with null condition hits isTruthy null branch
    const nullCond = new ast.Block(tok(TokenType.LBRACE,'{'), []);
    const ifNull = new ast.If(tok(TokenType.IF,'si'), nullCond, new ast.Block(tok(TokenType.LBRACE,'{'), [new ast.ExpressionStatement(tok(TokenType.NUM,'1'), numLeft)]));
    const resultNull = evaluate(ifNull, env);
    expect(resultNull).toBeInstanceOf(Null);
  });
});
