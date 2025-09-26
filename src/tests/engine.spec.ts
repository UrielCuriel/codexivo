import { describe, expect, it } from 'bun:test';

import { CodexivoEngine } from '../engine';
import { Number as NumberObj } from '../object';

describe('CodexivoEngine', () => {
  it('exposes AST metadata with parent-child relationships and positions', () => {
    const engine = new CodexivoEngine();
    const source = `variable total = 5;\ntotal;`;
    const { ast, errors } = engine.getAST(source);

    expect(errors).toEqual([]);
    expect(ast).not.toBeNull();

    const program = ast!;
    expect(program.type).toBe('Program');
    expect(program.position.line).toBe(1);
    expect(program.parentId).toBeNull();
    expect(program.children.length).toBeGreaterThan(0);

    const letChild = program.children.find(child => child.node.type === 'LetStatement');
    expect(letChild).toBeDefined();
    expect(letChild!.relation).toBe('statement');
    expect(letChild!.node.parentId).toBe(program.id);
    expect(letChild!.node.metadata.identifier).toBe('total');
    expect(letChild!.node.position.line).toBe(1);

    const valueChild = letChild!.node.children.find(child => child.relation === 'value');
    expect(valueChild).toBeDefined();
    expect(valueChild!.node.type).toBe('Number');
    expect(valueChild!.node.metadata.value).toBe(5);
    expect(valueChild!.node.position.column).toBeGreaterThan(0);
  });

  it('runs code with runtime tracing, breakpoints, and state snapshots', () => {
    const engine = new CodexivoEngine();
    const source = `
variable a = 1;
variable incrementar = procedimiento(valor) {
  variable siguiente = valor + 1;
  regresa siguiente;
};
variable resultado = incrementar(a);
resultado;
`.trim();

    const { result, trace, errors } = engine.run(source, {
      trace: true,
      stepMode: true,
      breakpoints: [{ line: 4 }],
    });

    expect(errors).toEqual([]);
    expect(result).toBeInstanceOf(NumberObj);
    expect((result as NumberObj).value).toBe(2);
    expect(trace).toBeDefined();
    expect(trace!.events.length).toBeGreaterThan(0);

    const breakpointEvent = trace!.events.find(event => event.breakpoint);
    expect(breakpointEvent).toBeDefined();
    expect(breakpointEvent!.position.line).toBe(4);

    const letEvent = trace!.events.find(event => event.nodeType === 'LetStatement' && event.metadata?.identifier === 'resultado');
    expect(letEvent).toBeDefined();
    expect(letEvent!.changes.some(change => change.name === 'resultado')).toBe(true);
    expect(letEvent!.environment.scopes[0].variables.resultado.value).toBe(2);

    const innerLet = trace!.events.find(
      event => event.nodeType === 'LetStatement' && event.metadata?.identifier === 'siguiente',
    );
    expect(innerLet).toBeDefined();
    expect(innerLet!.callStack.some(frame => frame.type === 'function')).toBe(true);

    const stepIterator = trace!.events[Symbol.iterator]();
    expect(stepIterator.next().done).toBe(false);
  });
});
