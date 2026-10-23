import { describe, expect, test } from 'bun:test';
import { childrenOf, parse, printExpression, traceParse, walk } from '../src';
import type { ast, ParseEvent } from '../src';

/** Los nodos del AST por `id`. */
const nodesById = (program: ast.Program): Map<number, ast.Node> => {
  const nodes = new Map<number, ast.Node>();
  walk(program, node => nodes.set(node.id, node));
  return nodes;
};

/** Las decisiones de precedencia, legibles: `2: + vs * → se_lo_lleva`. */
const decisions = (source: string): string[] => {
  const { program, trace, errors } = traceParse(source);
  expect(errors).toEqual([]);
  const nodes = nodesById(program);
  return trace.flatMap(event => {
    if (event.type !== 'precedence') return [];
    const operand = printExpression(nodes.get(event.operand) as ast.Expression);
    const building = event.building ? `${event.building.operator} vs ` : '';
    return [`${operand}: ${building}${event.incoming.operator} → ${event.decision}`];
  });
};

interface Built {
  kind: string;
  id?: number;
  children: Built[];
}

/** Reconstruye el árbol solo con `enter` y `exit`, como lo haría una vista que lo anima. */
const rebuild = (trace: ParseEvent[]): Built => {
  const done = new Map<number, Built>();
  const stack: Built[] = [{ kind: 'raíz', children: [] }];
  for (const event of trace) {
    if (event.type === 'enter') {
      const node: Built = { kind: event.kind, children: [] };
      if (event.left !== undefined) {
        // El nodo ya construido pasa a ser el primer hijo del nuevo.
        const left = done.get(event.left)!;
        const parent = stack.at(-1)!;
        expect(parent.children.at(-1)).toBe(left);
        parent.children.pop();
        node.children.push(left);
      }
      stack.push(node);
    } else if (event.type === 'exit') {
      const node = stack.pop()!;
      expect(node.kind).toBe(event.kind);
      node.id = event.id;
      done.set(event.id, node);
      stack.at(-1)!.children.push(node);
    } else if (event.type === 'recover') {
      for (const kind of event.abandoned) expect(stack.pop()!.kind).toBe(kind);
    }
  }
  expect(stack).toHaveLength(1);
  expect(stack[0]!.children).toHaveLength(1);
  return stack[0]!.children[0]!;
};

const shape = (node: ast.Node): Built => ({ kind: node.kind, id: node.id, children: childrenOf(node).map(shape) });

/** La traza construye exactamente el árbol que regresa `parse`, con los mismos `id`. */
const expectSameTree = (source: string): ReturnType<typeof traceParse> => {
  const result = traceParse(source);
  expect(rebuild(result.trace)).toEqual(shape(result.program));
  return result;
};

const ALL_CONSTRUCTS = `
variable x = -1 + 2 * 3 ^ 2
constante nombres = ["Ana", "Luis"]
variable edades = { "Ana": 30, "Luis": 25 }
x = x + 1
x += 2
x++
edades.Ana = edades["Luis"] + 1
procedimiento doble(n) {
  regresa n * 2
}
variable triple = procedimiento(n) { regresa n * 3 }
si (x > 3 y no (x == 5)) {
  imprimir("grande")
} pero_si (x es_igual_a 3) {
  imprimir("tres")
} si_no {
  imprimir(nulo, verdadero, falso)
}
mientras (x < 10) { x = x + 1 }
hacer { x = x - 1 } hasta_que (x < 0)
para (variable i = 0; i < 3; i++) { continuar }
para i desde 1 hasta 10 con_paso 2 { romper }
repetir 2 veces { imprimir(doble(x)) }
para_cada nombre, posición en nombres { imprimir(nombre) }
dominio cosas {
  variable total = 0
}
;
`;

describe('traza del parser', () => {
  test('`1 + 2 * 3`: el `*` se lleva al 2; `(1 + 2) * 3`: el paréntesis ya cerró el `+`', () => {
    expect(decisions('1 + 2 * 3')).toEqual(['1: + → se_lo_lleva', '2: + vs * → se_lo_lleva']);
    expect(decisions('(1 + 2) * 3')).toEqual(['1: + → se_lo_lleva', '1 + 2: * → se_lo_lleva']);
    expect(decisions('1 * 2 + 3')).toEqual(['1: * → se_lo_lleva', '2: * vs + → se_queda', '1 * 2: + → se_lo_lleva']);
  });

  test('`1 < 2 y 5 < 4`: el 2 se queda con el `<` y la `y` une las dos comparaciones', () => {
    expect(decisions('1 < 2 y 5 < 4')).toEqual([
      '1: < → se_lo_lleva',
      '2: < vs y → se_queda',
      '1 < 2: y → se_lo_lleva',
      '5: y vs < → se_lo_lleva',
    ]);
    const { program } = expectSameTree('1 < 2 y 5 < 4');
    const statement = program.statements[0] as ast.ExpressionStatement;
    expect(statement.expression).toMatchObject({
      kind: 'Logical',
      left: { kind: 'Binary' },
      right: { kind: 'Binary' },
    });
  });

  test('`no a == b`: la comparación se lleva a `a` antes que el `no`', () => {
    expect(decisions('no a == b')).toEqual(['a: no vs == → se_lo_lleva']);
  });

  test('`^` agrupa a la derecha: compara con una precedencia menos', () => {
    const { trace } = traceParse('2 ^ 3 ^ 2');
    const second = trace.filter(event => event.type === 'precedence')[1]!;
    expect(second).toMatchObject({ building: { operator: '^' }, incoming: { operator: '^' }, decision: 'se_lo_lleva' });
    if (second.type !== 'precedence') throw new Error();
    expect(second.building!.precedence).toBeLessThan(second.incoming.precedence);
  });

  test('`si … pero_si … si_no`: los nodos se abren, esperan a sus hijos y se cierran en orden', () => {
    const source = 'si (x > 0) {\n  imprimir(1)\n} pero_si (x < 0) {\n  imprimir(2)\n} si_no {\n  imprimir(3)\n}';
    const { trace, program } = expectSameTree(source);
    const kinds = trace.flatMap(event =>
      (event.type === 'enter' || event.type === 'exit') && (event.kind === 'If' || event.kind === 'Block')
        ? [`${event.type} ${event.kind}`]
        : [],
    );
    expect(kinds).toEqual([
      'enter If',
      'enter Block',
      'exit Block',
      'enter Block',
      'exit Block',
      'enter Block',
      'exit Block',
      'exit If',
    ]);
    const ifExit = trace.find(event => event.type === 'exit' && event.kind === 'If')!;
    expect(ifExit).toMatchObject({ id: program.statements[0]!.id, span: program.statements[0]!.span });
  });

  test('una llamada toma al procedimiento ya construido y después sus argumentos', () => {
    const { trace, program, tokens } = expectSameTree('sumar(1, x)');
    const call = (program.statements[0] as ast.ExpressionStatement).expression as ast.Call;
    const enterCall = trace.findIndex(event => event.type === 'enter' && event.kind === 'Call');
    expect(trace[enterCall]).toMatchObject({ left: call.callee.id, span: tokens[1]!.span });
    expect(trace[enterCall - 1]).toMatchObject({
      type: 'precedence',
      operand: call.callee.id,
      decision: 'se_lo_lleva',
    });
    const consumed = trace.flatMap(event => (event.type === 'consume' ? [event.lexeme] : []));
    expect(consumed).toEqual(['sumar', '(', '1', ',', 'x', ')']);
    const argExits = trace.filter(
      (event, index) => index > enterCall && event.type === 'exit' && call.args.some(arg => arg.id === event.id),
    );
    expect(argExits).toHaveLength(2);
  });

  test('un error: dónde falla, qué nodos abandona y hasta dónde salta para seguir', () => {
    const source = 'variable = 3\nimprimir(1)';
    const { trace, errors, tokens, program } = expectSameTree(source);
    expect(errors.map(error => error.code)).toEqual(['NOMBRE_ESPERADO']);
    const errorAt = trace.findIndex(event => event.type === 'error');
    expect(trace[errorAt]).toEqual({
      type: 'error',
      code: 'NOMBRE_ESPERADO',
      message: errors[0]!.message,
      span: errors[0]!.span!,
    });
    expect(trace[errorAt + 1]).toEqual({
      type: 'recover',
      abandoned: ['VariableDeclaration'],
      skipped: { from: 1, to: 3 },
      span: { start: tokens[1]!.span.start, end: tokens[2]!.span.end },
    });
    // Sigue con la línea siguiente.
    expect(trace[errorAt + 2]).toMatchObject({ type: 'enter', kind: 'Identifier', span: tokens[3]!.span });
    expect(program.statements.map(statement => statement.kind)).toEqual(['ExpressionStatement']);
  });

  test('un error dentro de un bloque abandona solo lo que estaba abierto en esa sentencia', () => {
    const source = 'si (x > 0) {\n  imprimir(1 +)\n  imprimir(2)\n}';
    const { trace, errors } = expectSameTree(source);
    expect(errors.map(error => error.code)).toEqual(['EXPRESIÓN_ESPERADA']);
    const recover = trace.find(event => event.type === 'recover')!;
    expect(recover).toMatchObject({ abandoned: ['Binary', 'Call'] });
    // El `si` y su bloque siguen abiertos y se cierran normalmente.
    expect(trace.at(-2)).toMatchObject({ type: 'exit', kind: 'If' });
  });

  test('la traza construye el mismo árbol que `parse`, con los mismos `id`, para todas las construcciones', () => {
    const { program, trace, tokens } = expectSameTree(ALL_CONSTRUCTS);
    const consumed = trace.flatMap(event => (event.type === 'consume' ? [event.index] : []));
    // Sin errores, consume todos los tokens en orden, menos el final.
    expect(consumed).toEqual(tokens.slice(0, -1).map((_, index) => index));
    expect(parse(ALL_CONSTRUCTS).program).toEqual(program);
    const exits = trace.filter(event => event.type === 'exit');
    expect(exits.map(event => (event.type === 'exit' ? event.id : 0)).sort((a, b) => a - b)).toEqual(
      [...nodesById(program).keys()].sort((a, b) => a - b),
    );
  });

  test('sin `trace`, no hay traza; con ella, el AST es el mismo', () => {
    const plain = parse(ALL_CONSTRUCTS);
    expect(plain.trace).toBeUndefined();
    expect(traceParse(ALL_CONSTRUCTS).program).toEqual(plain.program);
    expect(parse('1 + 2', { trace: true }).trace).toBeArray();
  });

  test('es determinista y serializable', () => {
    const source = `${ALL_CONSTRUCTS}\nvariable = 1\nimprimir(1 +)`;
    const first = traceParse(source).trace;
    expect(traceParse(source).trace).toEqual(first);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
    expect(structuredClone(first)).toEqual(first);
  });
});
