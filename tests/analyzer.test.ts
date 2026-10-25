import { describe, expect, test } from 'bun:test';
import { analyze, analyzeProgram, catalog, createWorld, parse, prepare, run, Session } from '../src';
import type { Analysis, Diagnostic } from '../src';
import { libraryProcedures } from '../src/runtime/prelude';

const diagnosticsOf = (source: string, options: Parameters<typeof analyze>[1] = {}): Diagnostic[] =>
  analyze(source, { flow: false, ...options }).diagnostics;

/** `CÓDIGO@línea` de cada diagnóstico, para comparar de un vistazo. */
const codes = (source: string, options?: Parameters<typeof analyze>[1]): string[] =>
  diagnosticsOf(source, options).map(diagnostic => `${diagnostic.code}@${diagnostic.span.start.line}`);

/** El analizador dice exactamente lo mismo que la máquina cuando el programa llega a esa línea. */
const sameAsRuntime = (source: string, options: Parameters<typeof run>[1] = {}) => {
  const [diagnostic] = diagnosticsOf(source, { world: Boolean(options.world) });
  const [error] = run(source, options).errors;
  expect(error).toBeDefined();
  expect(diagnostic).toBeDefined();
  expect({ code: diagnostic!.code, message: diagnostic!.message }).toEqual({
    code: error!.code,
    message: error!.message,
  });
  // El analizador puede dar una pista más (dónde se declaró el procedimiento); si la máquina da una, es la misma.
  if (error!.hint) expect(diagnostic!.hint).toBe(error!.hint);
  expect(diagnostic!.span).toEqual(error!.span!);
};

describe('nombres', () => {
  test('un nombre que no existe', () => {
    expect(codes('imprimir(x)')).toEqual(['NOMBRE_DESCONOCIDO@1']);
    sameAsRuntime('imprimir(x)');
  });

  test('sugiere el nombre parecido, como la máquina', () => {
    const [diagnostic] = diagnosticsOf('variable total = 1\nimprimir(totl)');
    expect(diagnostic!.hint).toBe('¿Quisiste decir `total`?');
    sameAsRuntime('variable total = 1\nimprimir(totl)');
  });

  test('una variable existe desde su declaración, no antes', () => {
    const [diagnostic] = diagnosticsOf('imprimir(x)\nvariable x = 1');
    expect(diagnostic!.code).toBe('NOMBRE_DESCONOCIDO');
    expect(diagnostic!.hint).toBe('`x` se declara más abajo, en la línea 2; una variable existe desde su declaración.');
    expect(run('imprimir(x)\nvariable x = 1').errors[0]!.code).toBe('NOMBRE_DESCONOCIDO');
  });

  test('el valor de una declaración se evalúa antes de que exista la variable', () => {
    expect(codes('variable x = x + 1')).toEqual(['NOMBRE_DESCONOCIDO@1']);
    expect(codes('variable x = 1\n{\n  variable x = x + 1\n}')).toEqual([]);
  });

  test('los procedimientos con nombre existen desde el inicio de su bloque', () => {
    expect(codes('imprimir(doble(2))\nprocedimiento doble(n) { regresa n * 2 }')).toEqual([]);
  });

  test('un procedimiento puede usar lo que se declare después de él', () => {
    expect(codes('procedimiento saluda() { imprimir(nombre) }\nvariable nombre = "Ana"\nsaluda()')).toEqual([]);
    expect(codes('variable f = procedimiento() { regresa g() }\nprocedimiento g() { regresa 1 }')).toEqual([]);
  });

  test('dentro de un procedimiento, sus propias variables siguen el orden', () => {
    expect(codes('procedimiento f() {\n  imprimir(a)\n  variable a = 1\n}')).toEqual(['NOMBRE_DESCONOCIDO@2']);
  });

  test('lo declarado en un bloque deja de existir al cerrarlo', () => {
    expect(codes('si (verdadero) { variable x = 1 }\nimprimir(x)')).toEqual(['NOMBRE_DESCONOCIDO@2']);
    expect(codes('para (variable i = 0; i < 3; i++) { }\nimprimir(i)')).toEqual(['NOMBRE_DESCONOCIDO@2']);
    expect(codes('para_cada e en [1] { }\nimprimir(e)')).toEqual(['NOMBRE_DESCONOCIDO@2']);
  });

  test('un bloque ve lo de afuera hasta que declara lo suyo', () => {
    expect(codes('variable x = 1\n{\n  imprimir(x)\n  variable x = 2\n  imprimir(x)\n}')).toEqual([]);
  });

  test('parámetros, variables de bucle y claves de diccionario', () => {
    expect(codes('procedimiento f(a, b) { regresa a + b }')).toEqual([]);
    expect(codes('para i desde 1 hasta 3 { imprimir(i) }')).toEqual([]);
    expect(codes('para_cada clave, valor en { "a": 1 } { imprimir(clave, valor) }')).toEqual([]);
    expect(codes('variable d = { "a": 1 }\nimprimir(d.a, d["a"])')).toEqual([]);
  });

  test('la biblioteca y las constantes se conocen', () => {
    expect(
      codes('imprimir(máximo(1, 2), maximo(1, 2), PI, longitud(mapear([1], procedimiento(x) { regresa x })))'),
    ).toEqual([]);
  });

  test('una variable propia oculta un nombre de la biblioteca', () => {
    expect(codes('variable máximo = 1\nmáximo = 2\nimprimir(máximo)')).toEqual([]);
  });

  test('los procedimientos del mundo solo existen en modo mundo', () => {
    expect(codes('avanzar()')).toEqual(['NOMBRE_DESCONOCIDO@1']);
    expect(codes('avanzar()', { world: true })).toEqual([]);
    expect(codes('avanzar()', { world: catalog.exampleWorld })).toEqual([]);
    sameAsRuntime('avanzar()');
  });

  test('nativos adicionales y variables de fuera', () => {
    expect(codes('saluda(1)\nx = x + 1', { natives: { saluda: { arity: 1 } }, globals: ['x'] })).toEqual([]);
    expect(codes('saluda(1, 2)', { natives: { saluda: { arity: 1 } } })).toEqual(['CANTIDAD_DE_ARGUMENTOS@1']);
  });
});

describe('asignaciones', () => {
  test('asignar a una variable que no existe', () => {
    expect(codes('x = 1')).toEqual(['VARIABLE_NO_DECLARADA@1']);
    expect(codes('x += 1')).toEqual(['VARIABLE_NO_DECLARADA@1']);
    expect(codes('x++')).toEqual(['VARIABLE_NO_DECLARADA@1']);
    sameAsRuntime('x = 1');
    sameAsRuntime('x += 1');
    const [diagnostic] = diagnosticsOf('x = 1\nvariable x = 2');
    expect(diagnostic!.hint).toContain('se declara más abajo, en la línea 2');
  });

  test('asignar a un nombre de la biblioteca sin declararlo', () => {
    expect(codes('imprimir = 1')).toEqual(['NOMBRE_RESERVADO_POR_BIBLIOTECA@1']);
    expect(codes('PI = 3')).toEqual(['NOMBRE_RESERVADO_POR_BIBLIOTECA@1']);
    expect(codes('mapear = 3')).toEqual(['NOMBRE_RESERVADO_POR_BIBLIOTECA@1']);
    sameAsRuntime('imprimir = 1');
    sameAsRuntime('PI = 3');
  });

  test('cambiar una constante', () => {
    expect(codes('constante K = 1\nK = 2\nK += 1\nK++')).toEqual([
      'CONSTANTE_REASIGNADA@2',
      'CONSTANTE_REASIGNADA@3',
      'CONSTANTE_REASIGNADA@4',
    ]);
    sameAsRuntime('constante K = 1\nK = 2');
  });

  test('cambiar la variable de un `para … desde … hasta`', () => {
    expect(codes('para i desde 1 hasta 3 { i = 5 }')).toEqual(['VARIABLE_DE_PARA@1']);
    expect(codes('para i desde 1 hasta 3 { i += 1 }')).toEqual(['VARIABLE_DE_PARA@1']);
    sameAsRuntime('para i desde 1 hasta 3 { i = 5 }');
    expect(codes('para_cada e en [1] { e = 5 }')).toEqual([]);
  });

  test('declarar dos veces en el mismo bloque', () => {
    expect(codes('variable x = 1\nvariable x = 2')).toEqual(['VARIABLE_REPETIDA@2']);
    expect(codes('procedimiento f(x) { variable x = 1 }')).toEqual(['VARIABLE_REPETIDA@1']);
    expect(codes('para i desde 1 hasta 3 { variable i = 1 }')).toEqual(['VARIABLE_REPETIDA@1']);
    expect(codes('variable x = 1\n{ variable x = 2 }')).toEqual([]);
    sameAsRuntime('variable x = 1\nvariable x = 2');
  });

  test('un procedimiento repetido lo señala el parser, no el analizador', () => {
    const analysis = analyze('procedimiento f() { }\nvariable f = 1');
    expect(analysis.errors.map(error => error.code)).toEqual(['NOMBRE_REPETIDO']);
    expect(analysis.diagnostics).toEqual([]);
  });

  test('con `allowRedeclare` se puede volver a declarar, como en el REPL', () => {
    expect(codes('variable x = 1\nvariable x = 2', { allowRedeclare: true })).toEqual([]);
  });
});

describe('llamadas', () => {
  test('cantidad de argumentos de un procedimiento del programa', () => {
    const [diagnostic] = diagnosticsOf('procedimiento suma(a, b) { regresa a + b }\nsuma(1)');
    expect(diagnostic!.code).toBe('CANTIDAD_DE_ARGUMENTOS');
    expect(diagnostic!.message).toBe('`suma` espera 2 valores, pero recibió 1.');
    expect(diagnostic!.hint).toBe('Se declaró como `procedimiento suma(a, b)` en la línea 1.');
    expect(codes('procedimiento suma(a, b) { regresa a + b }\nsuma(1, 2)')).toEqual([]);
  });

  test('cantidad de argumentos de la biblioteca', () => {
    expect(codes('máximo()')).toEqual(['CANTIDAD_DE_ARGUMENTOS@1']);
    expect(codes('mapear([1])')).toEqual(['CANTIDAD_DE_ARGUMENTOS@1']);
    expect(codes('imprimir()\nimprimir(1, 2, 3)\nredondear(1.5)\nredondear(1.5, 1)')).toEqual([]);
    sameAsRuntime('máximo()');
    sameAsRuntime('mapear([1])');
    sameAsRuntime('avanzar(1)', { world: createWorld(catalog.exampleWorld) });
  });

  test('una constante con un procedimiento se revisa; una variable, no (puede cambiar)', () => {
    expect(codes('constante doble = procedimiento(n) { regresa n * 2 }\ndoble(1, 2)')).toEqual([
      'CANTIDAD_DE_ARGUMENTOS@2',
    ]);
    expect(codes('variable f = procedimiento(n) { regresa n }\nf = procedimiento() { regresa 1 }\nf()')).toEqual([]);
  });

  test('llamar a algo que no es un procedimiento', () => {
    expect(codes('PI()')).toEqual(['NO_ES_PROCEDIMIENTO@1']);
    expect(codes('constante n = 3\nn()')).toEqual(['NO_ES_PROCEDIMIENTO@2']);
    expect(codes('dominio d { }\nd()')).toEqual(['NO_ES_PROCEDIMIENTO@2']);
    sameAsRuntime('PI()');
    sameAsRuntime('constante n = 3\nn()');
    // Una variable puede guardar cualquier cosa: no se adivina.
    expect(codes('variable n = 3\nn()')).toEqual([]);
  });
});

describe('dominios', () => {
  const source = [
    'dominio calc {',
    '  variable total = 0',
    '  constante K = 2',
    '  procedimiento suma(a, b) { regresa a + b }',
    '  dominio interno { variable v = 1 }',
    '}',
  ].join('\n');

  test('miembros que existen', () => {
    expect(codes(`${source}\nimprimir(calc.total, calc.K, calc.suma(1, 2), calc.interno.v)\ncalc.total = 5`)).toEqual(
      [],
    );
  });

  test('un miembro que no existe, con sugerencia', () => {
    const [diagnostic] = diagnosticsOf(`${source}\ncalc.sumar(1, 2)`);
    expect(diagnostic!.code).toBe('MIEMBRO_INEXISTENTE');
    expect(diagnostic!.hint).toBe('¿Quisiste decir `calc.suma`?');
    expect(codes(`${source}\ncalc.interno.w = 1`)).toEqual(['MIEMBRO_INEXISTENTE@7']);
    sameAsRuntime(`${source}\ncalc.sumar(1, 2)`);
  });

  test('cantidad de argumentos de un procedimiento del dominio', () => {
    expect(codes(`${source}\ncalc.suma(1)`)).toEqual(['CANTIDAD_DE_ARGUMENTOS@7']);
    sameAsRuntime(`${source}\ncalc.suma(1)`);
  });

  test('solo se cambian desde fuera los miembros declarados con `variable`', () => {
    expect(codes(`${source}\ncalc.K = 3`)).toEqual(['MIEMBRO_DE_SOLO_LECTURA@7']);
    expect(codes(`${source}\ncalc.suma = 3`)).toEqual(['MIEMBRO_DE_SOLO_LECTURA@7']);
    sameAsRuntime(`${source}\ncalc.K = 3`);
  });

  test('el nombre del dominio no se reasigna', () => {
    expect(codes(`${source}\ncalc = 1`)).toEqual(['CONSTANTE_REASIGNADA@7']);
    sameAsRuntime(`${source}\ncalc = 1`);
  });

  test('el dominio existe después de su bloque; dentro, sus miembros se ven sin prefijo', () => {
    expect(codes('imprimir(d.x)\ndominio d { variable x = 1 }')).toEqual(['NOMBRE_DESCONOCIDO@1']);
    expect(codes('dominio d {\n  variable x = 1\n  procedimiento f() { regresa x + w }\n  variable w = 2\n}')).toEqual(
      [],
    );
  });

  test('un campo de diccionario no es un miembro de dominio', () => {
    expect(codes('variable d = { "a": 1 }\nd.b = 2\nimprimir(d.c)')).toEqual([]);
  });
});

describe('código a medias', () => {
  test('con errores de sintaxis se omiten los avisos de nombres que no existen', () => {
    const analysis = analyze('variable x =\nimprimir(x, w)\nsi (x > 1 {');
    expect(analysis.errors.length).toBeGreaterThan(0);
    expect(analysis.diagnostics).toEqual([]);
  });

  test('pero se conservan los que no dependen de lo abandonado', () => {
    const analysis = analyze('constante K = 1\nK = 2\nsi (');
    expect(analysis.errors.length).toBeGreaterThan(0);
    expect(analysis.diagnostics.map(diagnostic => diagnostic.code)).toEqual(['CONSTANTE_REASIGNADA']);
  });

  test('el diagrama se genera con lo que sí se entendió', () => {
    const analysis = analyze('variable x = 1\nimprimir(x)\nsi (');
    expect(analysis.flow!.nodes.map(node => node.kind)).toEqual(['inicio', 'proceso', 'salida', 'fin']);
  });
});

describe('símbolos', () => {
  test('cada declaración, su alcance y sus usos', () => {
    const { symbols } = analyze('variable x = 1\nx = x + 1\nx++\nprocedimiento f(a) { regresa a }\nf(x)');
    expect(symbols.map(symbol => `${symbol.kind} ${symbol.name}`)).toEqual([
      'variable x',
      'procedimiento f',
      'parámetro a',
    ]);
    const [x, f, a] = symbols;
    expect(x!.references.map(reference => `${reference.kind}@${reference.span.start.line}`)).toEqual([
      'lectura@2',
      'escritura@2',
      'actualización@3',
      'lectura@5',
    ]);
    expect(x!.scope.span.start).toEqual({ line: 1, column: 1, offset: 0 });
    expect(f!.params).toEqual(['a']);
    expect(f!.references.map(reference => reference.span.start.line)).toEqual([5]);
    expect(a!.scope.span.start.line).toBe(4);
    expect(symbols.map(symbol => symbol.id)).toEqual([0, 1, 2]);
  });

  test('la variable de `para` y los miembros de un dominio', () => {
    const { symbols } = analyze('para i desde 1 hasta 3 { }\ndominio d { constante K = 1 }\nimprimir(d.K)');
    expect(symbols.map(symbol => `${symbol.kind} ${symbol.name}`)).toEqual(['variable i', 'dominio d', 'constante K']);
    expect(symbols[0]!.loop).toBe(true);
    expect(symbols[2]!.domain).toBe(1);
    expect(symbols[2]!.references.map(reference => reference.span.start.line)).toEqual([3]);
    expect(symbols[1]!.references).toHaveLength(1);
  });

  test('es serializable', () => {
    const analysis = analyze('procedimiento f(a) { regresa a }\ndominio d { variable x = f(1) }');
    expect(JSON.parse(JSON.stringify(analysis))).toEqual(analysis);
  });
});

describe('analyze', () => {
  test('junta tokens, AST, errores, diagnósticos, símbolos y diagrama', () => {
    const analysis: Analysis = analyze('variable x = 1\nimprimir(w)');
    expect(analysis.tokens.length).toBeGreaterThan(3);
    expect(analysis.program.statements).toHaveLength(2);
    expect(analysis.errors).toEqual([]);
    expect(analysis.diagnostics.map(diagnostic => diagnostic.code)).toEqual(['NOMBRE_DESCONOCIDO']);
    expect(analysis.diagnostics[0]).toMatchObject({ kind: 'análisis', severity: 'error' });
    expect(analysis.symbols.map(symbol => symbol.name)).toEqual(['x']);
    expect(analysis.flow!.nodes.map(node => node.key)).toEqual(['inicio', '0', '1', 'fin']);
  });

  test('`flow: false` no genera el diagrama; las opciones del diagrama se pasan', () => {
    expect(analyze('imprimir(1)', { flow: false }).flow).toBeUndefined();
    expect(analyze('procedimiento f() { }', { flow: { expandProcedures: true } }).flow!.procedures).toHaveLength(1);
  });

  test('analyzeProgram trabaja sobre un AST ya construido', () => {
    const { program } = parse('imprimir(x)');
    expect(analyzeProgram(program).diagnostics.map(diagnostic => diagnostic.code)).toEqual(['NOMBRE_DESCONOCIDO']);
  });

  test('prepare trae los diagnósticos sin impedir ejecutar', () => {
    const prepared = prepare('imprimir("hola")\nimprimir(x)');
    expect(prepared.diagnostics.map(diagnostic => diagnostic.code)).toEqual(['NOMBRE_DESCONOCIDO']);
    expect(prepared.machine).toBeDefined();
    expect(prepare('variable = 1').diagnostics).toEqual([]);
  });

  test('prepare conoce las variables de una sesión del REPL', () => {
    const session = new Session();
    session.run('variable x = 1');
    expect(session.run('x = x + 1').errors).toEqual([]);
    expect(session.run('variable x = 5').errors).toEqual([]);
  });
});

describe('no inventa errores', () => {
  const DOCUMENTS = ['README.md', 'docs/lenguaje.md', 'docs/recetario.md', 'docs/guia-aprender-desde-el-codigo.md'];
  for (const document of DOCUMENTS) {
    test(`cada ejemplo de ${document} pasa limpio`, async () => {
      const text = await Bun.file(new URL(`../${document}`, import.meta.url)).text();
      const blocks = [...text.matchAll(/```codexivo\r?\n([\s\S]*?)```/g)].map(match => match[1]!);
      for (const code of blocks) expect({ code, diagnostics: diagnosticsOf(code) }).toEqual({ code, diagnostics: [] });
    });
  }

  test('cada ejemplo del catálogo pasa limpio', () => {
    for (const entry of catalog.library) {
      for (const example of entry.examples) {
        const diagnostics = diagnosticsOf(example.code, { world: entry.category === 'mundo' });
        expect({ code: example.code, diagnostics }).toEqual({ code: example.code, diagnostics: [] });
      }
    }
  });

  test('la biblioteca escrita en Codexivo usa sus nativos internos', () => {
    // El prelude llama a nativos ocultos (`revisar_lista`…) que el programa no ve; se le dan como nativos.
    const internals = ['revisar_lista', 'revisar_procedimiento', 'revisar_logico', 'ordenar_natural'];
    for (const [name, procedure] of Object.entries(libraryProcedures)) {
      const node = procedure.chunk.node;
      expect(node.kind).toBe('FunctionLiteral');
      const diagnostics = analyzeProgram(
        {
          kind: 'Program',
          id: -1,
          span: node.span,
          statements: [
            {
              kind: 'FunctionDeclaration',
              id: -2,
              span: node.span,
              name: { kind: 'Identifier', id: -3, span: node.span, name },
              function: node as never,
            },
          ],
        },
        {
          natives: Object.fromEntries(
            internals.map(internal => [internal, { arity: [0, Infinity] as [number, number] }]),
          ),
        },
      ).diagnostics;
      expect({ name, diagnostics }).toEqual({ name, diagnostics: [] });
    }
  });
});
