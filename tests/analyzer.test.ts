import { describe, expect, test } from 'bun:test';
import { analyze, analyzeProgram, catalog, createWorld, parse, prepare, run, Session } from '../src';
import type { Analysis, Diagnostic } from '../src';
import { libraryProcedures } from '../src/runtime/prelude';

const diagnosticsOf = (source: string, options: Parameters<typeof analyze>[1] = {}): Diagnostic[] =>
  analyze(source, { flow: false, ...options }).diagnostics;

/** `CÓDIGO@línea` de cada diagnóstico de severidad `error` (los avisos se prueban aparte). */
const codes = (source: string, options?: Parameters<typeof analyze>[1]): string[] =>
  diagnosticsOf(source, options)
    .filter(diagnostic => diagnostic.severity === 'error')
    .map(diagnostic => `${diagnostic.code}@${diagnostic.span.start.line}`);

/** `CÓDIGO@línea` de cada advertencia o sugerencia. */
const warnings = (source: string, options?: Parameters<typeof analyze>[1]): string[] =>
  diagnosticsOf(source, options)
    .filter(diagnostic => diagnostic.severity !== 'error')
    .map(diagnostic => `${diagnostic.code}@${diagnostic.span.start.line}`);

/** El analizador dice exactamente lo mismo que la máquina cuando el programa llega a esa línea. */
const sameAsRuntime = (source: string, options: Parameters<typeof run>[1] = {}) => {
  const [diagnostic] = diagnosticsOf(source, { world: Boolean(options.world) }).filter(
    candidate => candidate.severity === 'error',
  );
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
    const [diagnostic] = diagnosticsOf('variable total = 1\nimprimir(totl)').filter(d => d.severity === 'error');
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
    expect(analysis.diagnostics.filter(diagnostic => diagnostic.severity === 'error')).toEqual([]);
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
    const [diagnostic] = diagnosticsOf(`${source}\ncalc.sumar(1, 2)`).filter(d => d.severity === 'error');
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
    expect(analysis.diagnostics.map(diagnostic => diagnostic.code)).toEqual(['VARIABLE_SIN_USO', 'NOMBRE_DESCONOCIDO']);
    expect(analysis.diagnostics[1]).toMatchObject({ kind: 'análisis', severity: 'error' });
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
      // Los ejemplos para quien aprende tampoco deben tener advertencias: lo que enseñan se usa.
      for (const code of blocks) expect({ code, diagnostics: diagnosticsOf(code) }).toEqual({ code, diagnostics: [] });
    });
  }

  test('cada ejemplo del catálogo pasa limpio', () => {
    for (const entry of catalog.library) {
      for (const example of entry.examples) {
        const diagnostics = diagnosticsOf(example.code, { world: entry.category === 'mundo' }).filter(
          diagnostic => diagnostic.severity === 'error',
        );
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
      ).diagnostics.filter(diagnostic => diagnostic.severity === 'error');
      expect({ name, diagnostics }).toEqual({ name, diagnostics: [] });
    }
  });
});

describe('sin uso', () => {
  test('variables y constantes que nunca se leen', () => {
    expect(warnings('variable x = 1')).toEqual(['VARIABLE_SIN_USO@1']);
    expect(warnings('constante K = 1')).toEqual(['VARIABLE_SIN_USO@1']);
    expect(warnings('variable x = 1\nimprimir(x)')).toEqual([]);
    const [written] = diagnosticsOf('variable x = 1\nx = 2\nx += 1');
    expect(written!.message).toBe('`x` cambia de valor pero nunca se lee.');
    expect(written!.severity).toBe('advertencia');
    const [never] = diagnosticsOf('variable x = 1');
    expect(never!.message).toBe('`x` se declara pero nunca se usa.');
  });

  test('leerse dentro de un procedimiento o de un dominio cuenta como uso', () => {
    expect(warnings('variable x = 1\nprocedimiento f() { regresa x }\nimprimir(f())')).toEqual([]);
    expect(warnings('dominio d { variable x = 1 }\nimprimir(d.x)')).toEqual([]);
    expect(warnings('dominio d { variable x = 1\n  procedimiento f() { regresa x } }\nimprimir(d.f())')).toEqual([]);
  });

  test('parámetros sin uso', () => {
    expect(warnings('procedimiento f(a, b) { regresa a }\nimprimir(f(1, 2))')).toEqual(['PARÁMETRO_SIN_USO@1']);
    expect(warnings('imprimir(mapear([1], procedimiento(x) { regresa 0 }))')).toEqual(['PARÁMETRO_SIN_USO@1']);
  });

  test('procedimientos y dominios que nadie usa', () => {
    expect(warnings('procedimiento f() { regresa 1 }')).toEqual(['PROCEDIMIENTO_SIN_USO@1']);
    expect(warnings('dominio d { }')).toEqual(['PROCEDIMIENTO_SIN_USO@1']);
    expect(warnings('procedimiento f() { regresa 1 }\nimprimir(f())')).toEqual([]);
    expect(warnings('procedimiento f() { regresa 1 }\nimprimir(mapear([1], f))')).toEqual([]);
    // Un procedimiento que se llama a sí mismo pero nadie más llama tampoco se usa.
    expect(warnings('procedimiento f(n) { regresa f(n) }')).toEqual(['PROCEDIMIENTO_SIN_USO@1']);
  });

  test('`used`: lo que se usa desde fuera, como `resolver` en un reto', () => {
    const source = 'procedimiento resolver(n) { regresa n * 2 }';
    expect(warnings(source)).toEqual(['PROCEDIMIENTO_SIN_USO@1']);
    expect(warnings(source, { used: ['resolver'] })).toEqual([]);
    // Solo vale para lo declarado en el nivel del programa.
    expect(warnings('procedimiento f() { variable resolver = 1 }\nf()', { used: ['resolver'] })).toEqual([
      'VARIABLE_SIN_USO@1',
    ]);
  });

  test('la variable de un bucle que no se usa es una sugerencia', () => {
    const [range] = diagnosticsOf('para i desde 1 hasta 3 { imprimir("hola") }');
    expect(range).toMatchObject({ code: 'VARIABLE_SIN_USO', severity: 'sugerencia' });
    expect(range!.hint).toContain('`repetir n veces { … }`');
    const [each] = diagnosticsOf('para_cada e en [1, 2] { imprimir("hola") }');
    expect(each!.hint).toContain('`repetir longitud(lista) veces { … }`');
    const [value] = diagnosticsOf('para_cada k, v en { "a": 1 } { imprimir(k) }');
    expect(value!.message).toBe('La variable `v` del `para_cada` no se usa en el cuerpo.');
    expect(value!.hint).toContain('`para_cada clave en diccionario`');
    expect(warnings('para (variable i = 0; i < 2; i++) { imprimir(i) }')).toEqual([]);
  });

  test('con errores de sintaxis no se avisa de nombres sin uso', () => {
    expect(analyze('variable x = 1\nsi (').diagnostics).toEqual([]);
  });
});

describe('código inalcanzable', () => {
  test('después de `regresa`, `romper` y `continuar`', () => {
    const [after] = diagnosticsOf(
      'procedimiento f() {\n  regresa 1\n  imprimir("nunca")\n  imprimir("tampoco")\n}\nf()',
    );
    expect(after).toMatchObject({ code: 'CÓDIGO_INALCANZABLE', severity: 'advertencia' });
    expect(after!.message).toBe(
      'Este código nunca se ejecuta: el `regresa` de la línea 2 sale del procedimiento antes.',
    );
    expect(after!.span.start.line).toBe(3);
    expect(after!.span.end.line).toBe(4);
    expect(warnings('mientras (verdadero) {\n  romper\n  imprimir(1)\n}')).toEqual(['CÓDIGO_INALCANZABLE@3']);
    expect(warnings('repetir 2 veces {\n  continuar\n  imprimir(1)\n}')).toEqual(['CÓDIGO_INALCANZABLE@3']);
  });

  test('después de un `si` en el que todas las ramas salen', () => {
    const source =
      'procedimiento f(n) {\n  si (n > 0) { regresa 1 } si_no { regresa 2 }\n  imprimir(n)\n}\nimprimir(f(1))';
    const [warning] = diagnosticsOf(source).filter(diagnostic => diagnostic.severity !== 'error');
    expect(warning!.message).toBe('Este código nunca se ejecuta: todas las ramas del `si` de la línea 2 salen antes.');
    // Sin `si_no`, la sentencia siguiente sí se alcanza.
    expect(warnings('procedimiento f(n) {\n  si (n > 0) { regresa 1 }\n  regresa 2\n}\nimprimir(f(1))')).toEqual([]);
  });

  test('después de un `mientras (verdadero)` sin `romper`', () => {
    expect(warnings('mientras (verdadero) { imprimir(1) }\nimprimir(2)')).toEqual(['CÓDIGO_INALCANZABLE@2']);
    expect(warnings('mientras (verdadero) { si (leer() == nulo) { romper } }\nimprimir(2)')).toEqual([]);
    // Un `romper` de un bucle anidado no sale del de afuera.
    expect(warnings('mientras (verdadero) { repetir 2 veces { romper } }\nimprimir(2)')).toEqual([
      'CÓDIGO_INALCANZABLE@2',
    ]);
  });

  test('los procedimientos con nombre se crean al entrar al bloque: no quedan fuera', () => {
    expect(warnings('procedimiento g() {\n  regresa f()\n  procedimiento f() { regresa 1 }\n}\nimprimir(g())')).toEqual(
      [],
    );
  });

  test('el código inalcanzable se analiza de todas formas', () => {
    expect(codes('procedimiento f() {\n  regresa 1\n  imprimir(x)\n}\nf()')).toEqual(['NOMBRE_DESCONOCIDO@3']);
  });
});

describe('condiciones', () => {
  test('condiciones que siempre valen lo mismo', () => {
    const [always] = diagnosticsOf('si (verdadero) { imprimir(1) }');
    expect(always).toMatchObject({ code: 'CONDICIÓN_CONSTANTE', severity: 'advertencia' });
    expect(always!.message).toBe('La condición de `si` siempre es `verdadero`: esta rama se ejecuta siempre.');
    expect(warnings('si (1 > 0) { } pero_si (falso) { }')).toEqual(['CONDICIÓN_CONSTANTE@1']);
    expect(warnings('mientras (falso) { }')).toEqual(['CONDICIÓN_CONSTANTE@1']);
    expect(warnings('hacer { } hasta_que (verdadero)')).toEqual(['CONDICIÓN_CONSTANTE@1']);
    expect(warnings('para (; falso; ) { }')).toEqual(['CONDICIÓN_CONSTANTE@1']);
  });

  test('`mientras (verdadero)` y `hasta_que (falso)` son bucles normales', () => {
    expect(warnings('mientras (verdadero) { romper }')).toEqual([]);
    expect(warnings('hacer { romper } hasta_que (falso)')).toEqual([]);
  });

  test('una condición que no es lógica es un error, con el mensaje de la máquina', () => {
    expect(codes('si (1) { }')).toEqual(['CONDICIÓN_NO_LÓGICA@1']);
    sameAsRuntime('si (1) { }');
    sameAsRuntime('mientras ("sí") { }');
    sameAsRuntime('hacer { } hasta_que (nulo)');
    sameAsRuntime('para (; 1; ) { }');
    expect(codes('si (1 > 0) { }\nsi (verdadero y falso) { }')).toEqual([]);
  });
});

describe('operaciones entre literales', () => {
  test('lo que la máquina rechazaría, con su mismo mensaje', () => {
    expect(codes('imprimir(1 / 0)')).toEqual(['DIVISIÓN_ENTRE_CERO@1']);
    expect(codes('imprimir("total: " + 5)')).toEqual(['TIPOS_MEZCLADOS@1']);
    expect(codes('imprimir("a" - 1, no 5, [1, 2][5], 1 < "a")')).toEqual([
      'TIPO_INVÁLIDO@1',
      'TIPO_INVÁLIDO@1',
      'ÍNDICE_FUERA_DE_RANGO@1',
      'COMPARACIÓN_INVÁLIDA@1',
    ]);
    sameAsRuntime('imprimir(1 / 0)');
    sameAsRuntime('imprimir("total: " + 5)');
    sameAsRuntime('imprimir("a" - 1)');
    sameAsRuntime('variable x = [1, 2][5]');
  });

  test('cabezas de bucle con literales', () => {
    expect(codes('repetir "3" veces { }')).toEqual(['REPETICIONES_INVÁLIDAS@1']);
    expect(codes('para i desde 1 hasta 3 con_paso 0 { imprimir(i) }')).toEqual(['PARA_PASO_CERO@1']);
    expect(codes('para_cada e en 5 { imprimir(e) }')).toHaveLength(1);
    sameAsRuntime('repetir "3" veces { }');
    sameAsRuntime('para_cada e en 5 { imprimir(e) }');
  });

  test('lo que sí se puede calcular no avisa, y lo que lleva variables no se adivina', () => {
    expect(codes('imprimir(1 + 2 * 3, "a" + "b", -5, no verdadero, [1][0], 7 mod 2)')).toEqual([]);
    expect(codes('variable cero = 0\nimprimir(1 / cero)')).toEqual([]);
  });
});
