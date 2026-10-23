import { describe, expect, test } from 'bun:test';
import { flowGraph, parse, printExpression, printStatement, run } from '../src';
import type { ast, FlowGraph, FlowOptions } from '../src';

const graphOf = (source: string, options?: FlowOptions): FlowGraph => {
  const { program, errors } = parse(source);
  expect(errors).toEqual([]);
  return flowGraph(program, options);
};

/** Aristas como texto: `"x = 1" -[sí]-> "y"`, para comparar la forma del grafo de un vistazo. */
const edges = (graph: FlowGraph): string[] => {
  const label = (id: string) => graph.nodes.find(node => node.id === id)!.label;
  return graph.edges.map(edge => {
    const tag = [edge.label, edge.kind === 'normal' ? undefined : edge.kind].filter(Boolean).join(',');
    return `${label(edge.from)} -${tag ? `[${tag}]` : ''}-> ${label(edge.to)}`;
  });
};

const kinds = (graph: FlowGraph) => graph.nodes.map(node => `${node.kind}:${node.label}`);

describe('printer', () => {
  const expression = (source: string) => {
    const statement = parse(source).program.statements[0] as ast.ExpressionStatement;
    return printExpression(statement.expression);
  };

  test.each([
    ['1 + 2 * 3', '1 + 2 * 3'],
    ['(1 + 2) * 3', '(1 + 2) * 3'],
    ['1 - (2 - 3)', '1 - (2 - 3)'],
    ['2 ^ 3 ^ 2', '2 ^ 3 ^ 2'],
    ['(2 ^ 3) ^ 2', '(2 ^ 3) ^ 2'],
    ['-2 ^ 2', '-2 ^ 2'],
    ['(-2) ^ 2', '(-2) ^ 2'],
    ['no (a y b)', 'no (a y b)'],
    ['a o b y c', 'a o b y c'],
    ['(a o b) y c', '(a o b) y c'],
    ['x es_menor_o_igual_a 10', 'x <= 10'],
    ['7 % 2', '7 mod 2'],
    ['f(x, [1, "a"])[0]', 'f(x, [1, "a"])[0]'],
    ['persona.edad + 1', 'persona.edad + 1'],
    ['g({ "a": 1, (k): nulo })', 'g({ "a": 1, (k): nulo })'],
    ['procedimiento(a, b) { regresa a; }', 'procedimiento(a, b) { … }'],
  ])('%s → %s', (source, expected) => {
    expect(expression(source)).toBe(expected);
  });

  test('lo que imprime se vuelve a analizar igual', () => {
    for (const source of ['(1 + 2) * -x ^ 2', 'no a o b y (c o d)', '1 - (2 + 3) - 4', 'a / (b * c)']) {
      expect(expression(expression(source))).toBe(expression(source));
    }
  });

  test.each([
    ['suma += i;', 'suma += i'],
    ['i++;', 'i++'],
    ['constante K = 3;', 'constante K = 3'],
    ['lista[0] = 1;', 'lista[0] = 1'],
    ['repetir n * 2 veces { }', 'repetir n * 2 veces'],
    ['para_cada k, v en d { }', 'para_cada k, v en d'],
    ['procedimiento f(a, b) { }', 'procedimiento f(a, b)'],
  ])('sentencia %s → %s', (source, expected) => {
    expect(printStatement(parse(source).program.statements[0]!)).toBe(expected);
  });
});

describe('diagrama de flujo', () => {
  test('una secuencia va del inicio al fin', () => {
    const graph = graphOf('variable x = leer_número();\nx = x * 2;\nimprimir(x);');
    expect(kinds(graph)).toEqual([
      'inicio:inicio',
      'entrada:variable x = leer_número()',
      'proceso:x = x * 2',
      'salida:imprimir(x)',
      'fin:fin',
    ]);
    expect(graph.nodes.map(node => node.rank)).toEqual([0, 1, 2, 3, 4]);
  });

  test('agrupar sentencias simples consecutivas', () => {
    const graph = graphOf('variable a = 1;\nvariable b = 2;\nimprimir(a);\na = 3;', { group: true });
    expect(kinds(graph)).toEqual([
      'inicio:inicio',
      'proceso:variable a = 1\nvariable b = 2',
      'salida:imprimir(a)',
      'proceso:a = 3',
      'fin:fin',
    ]);
    expect(graph.nodes[1]!.astIds).toHaveLength(2);
  });

  test('las aristas de un `si` sin `si_no` llevan a la sentencia siguiente', () => {
    expect(edges(graphOf('si (x > 0) { x = 1; }\nimprimir(x);'))).toEqual([
      'inicio --> x > 0',
      'x > 0 -[sí]-> x = 1',
      'x = 1 --> imprimir(x)',
      'x > 0 -[no]-> imprimir(x)',
      'imprimir(x) --> fin',
    ]);
  });

  test('`si … pero_si … si_no` encadena las decisiones por la rama del no', () => {
    expect(edges(graphOf('si (a) { x = 1; } pero_si (b) { x = 2; } si_no { x = 3; }'))).toEqual([
      'inicio --> a',
      'a -[sí]-> x = 1',
      'a -[no]-> b',
      'b -[sí]-> x = 2',
      'b -[no]-> x = 3',
      'x = 1 --> fin',
      'x = 2 --> fin',
      'x = 3 --> fin',
    ]);
  });

  test('mientras', () => {
    expect(edges(graphOf('mientras (i < 3) { i++; }'))).toEqual([
      'inicio --> i < 3',
      'i < 3 -[sí]-> i++',
      'i++ -[vuelta]-> i < 3',
      'i < 3 -[no]-> fin',
    ]);
  });

  test('hacer … hasta_que', () => {
    expect(edges(graphOf('hacer { i++; } hasta_que (i == 3);'))).toEqual([
      'inicio --> i++',
      'i++ --> hasta_que i == 3',
      'hasta_que i == 3 -[no,vuelta]-> i++',
      'hasta_que i == 3 -[sí]-> fin',
    ]);
  });

  test('para', () => {
    expect(edges(graphOf('para (variable i = 0; i < 3; i++) { imprimir(i); }'))).toEqual([
      'inicio --> variable i = 0',
      'variable i = 0 --> i < 3',
      'i < 3 -[sí]-> imprimir(i)',
      'imprimir(i) --> i++',
      'i++ -[vuelta]-> i < 3',
      'i < 3 -[no]-> fin',
    ]);
  });

  test('repetir y para_cada usan las etiquetas repetir y salir', () => {
    expect(edges(graphOf('repetir 3 veces { avanzar(); }'))).toEqual([
      'inicio --> repetir 3 veces',
      'repetir 3 veces -[repetir]-> avanzar()',
      'avanzar() -[vuelta]-> repetir 3 veces',
      'repetir 3 veces -[salir]-> fin',
    ]);
    expect(graphOf('para_cada x en l { }').nodes[1]).toMatchObject({ kind: 'decisión', label: 'para_cada x en l' });
  });

  test('romper y continuar saltan a la salida y a la siguiente vuelta', () => {
    expect(
      edges(graphOf('para (variable i = 0; i < 9; i++) {\n  si (i == 2) { continuar; }\n  si (i == 5) { romper; }\n}')),
    ).toEqual([
      'inicio --> variable i = 0',
      'variable i = 0 --> i < 9',
      'i < 9 -[sí]-> i == 2',
      'i == 2 -[sí]-> continuar',
      'i == 2 -[no]-> i == 5',
      'i == 5 -[sí]-> romper',
      'i == 5 -[no]-> i++',
      'continuar -[continuar]-> i++',
      'i++ -[vuelta]-> i < 9',
      'i < 9 -[no]-> fin',
      'romper -[romper]-> fin',
    ]);
  });

  test('bucles anidados: `romper` sale solo del más cercano', () => {
    const graph = graphOf('mientras (a) {\n  repetir 3 veces { romper; }\n  b = 1;\n}');
    expect(edges(graph)).toContain('romper -[romper]-> b = 1');
  });

  test('regresa salta al fin', () => {
    const { program } = parse('procedimiento f(n) {\n  si (n == 0) { regresa 1; }\n  regresa n * f(n - 1);\n}');
    const graph = flowGraph(program.statements[0] as ast.FunctionDeclaration);
    expect(edges(graph)).toEqual([
      'procedimiento f(n) --> n == 0',
      'n == 0 -[sí]-> regresa 1',
      'n == 0 -[no]-> regresa n * f(n - 1)',
      'regresa 1 -[regresa]-> fin',
      'regresa n * f(n - 1) -[regresa]-> fin',
    ]);
  });

  test('expandir los procedimientos del programa', () => {
    const graph = graphOf('procedimiento saludar(n) { imprimir("Hola", n); }\nsaludar("Ana");', {
      expandProcedures: true,
    });
    expect(kinds(graph)).toEqual(['inicio:inicio', 'llamada:saludar("Ana")', 'fin:fin']);
    expect(graph.nodes[1]!.procedure).toBe('saludar');
    expect(graph.procedures!.map(procedure => procedure.name)).toEqual(['saludar']);
    expect(kinds(graph.procedures![0]!.graph)).toEqual([
      'inicio:procedimiento saludar(n)',
      'salida:imprimir("Hola", n)',
      'fin:fin',
    ]);
  });

  test('un dominio es un paso de proceso y sus procedimientos se nombran con su ruta', () => {
    const graph = graphOf('dominio c {\n  variable n = 0;\n  procedimiento f() { imprimir(n); }\n}\nc.f();', {
      expandProcedures: true,
    });
    expect(kinds(graph)).toEqual(['inicio:inicio', 'proceso:dominio c', 'llamada:c.f()', 'fin:fin']);
    expect(graph.procedures!.map(procedure => procedure.name)).toEqual(['c.f']);
  });

  test('las etiquetas largas se pueden recortar', () => {
    const graph = graphOf('variable mensaje = "un texto bastante largo";', { maxLabelLength: 12 });
    expect(graph.nodes[1]!.label).toBe('variable me…');
  });

  test('cada nodo y cada arista son datos serializables con su rango en el código', () => {
    const graph = graphOf('si (x) { z = 1; }');
    expect(JSON.parse(JSON.stringify(graph))).toEqual(graph);
    expect(graph.nodes[1]!.spans[0]!.start).toEqual({ line: 1, column: 1, offset: 0 });
  });
});

describe('el diagrama cubre la ejecución', () => {
  const programs = [
    'variable x = 0;\nsi (x > 0) { x = 1; } pero_si (x == 0) { x = 2; } si_no { x = 3; }',
    'variable i = 0;\nmientras (i < 3) { i++; si (i == 2) { continuar; } }',
    'variable i = 0;\nhacer { i++; } hasta_que (i == 3);',
    'para (variable i = 0; i < 5; i++) { si (i == 3) { romper; } }\npara (; falso;) { }',
    'variable t = 0;\nrepetir 3 veces { t += 1; }\npara_cada x en [1, 2] { t += x; }',
    'procedimiento f(n) {\n  si (n == 0) { regresa 0; }\n  regresa f(n - 1);\n}\nimprimir(f(3));',
    'variable d = { "a": 1 };\npara_cada k, v en d { imprimir(k, v); }\n{ variable z = 1; }',
    'dominio c {\n  variable n = 0;\n  dominio d { constante K = 1; }\n  procedimiento f() { regresa n + d.K; }\n}\nimprimir(c.f());',
  ];

  test.each(programs)('todo `nodeId` de `paso` y `decide` está en el grafo: %s', source => {
    const { program } = parse(source);
    const graph = flowGraph(program, { expandProcedures: true, group: true });
    const ids = new Set(
      [graph, ...(graph.procedures ?? []).map(procedure => procedure.graph)].flatMap(g =>
        g.nodes.flatMap(node => node.astIds),
      ),
    );
    const result = run(source, { trace: true });
    expect(result.errors).toEqual([]);
    const emitted = result.events!.flatMap(event =>
      event.type === 'paso' ? [event.nodeId] : event.type === 'decide' ? [event.nodeId, event.ownerId] : [],
    );
    expect(emitted.length).toBeGreaterThan(0);
    expect(emitted.filter(id => !ids.has(id))).toEqual([]);
  });
});
