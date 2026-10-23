import { describe, expect, test } from 'bun:test';
import { run } from '../src';
import type { RunOptions } from '../src';

/** Ejecuta y regresa el valor final como texto; falla si el programa tuvo errores. */
const value = (source: string, options?: RunOptions): string => {
  const result = run(source, options);
  if (!result.ok) throw new Error(result.errors.map(error => `${error.code}: ${error.message}`).join('\n'));
  return result.resultText;
};

/** Ejecuta un programa que debe fallar y regresa su error. */
const failure = (source: string, options?: RunOptions) => {
  const result = run(source, options);
  expect(result.ok).toBe(false);
  return result.errors[0]!;
};

describe('evaluación', () => {
  test.each([
    ['5', '5'],
    ['-5', '-5'],
    ['1 + 2 * 3 - 4 / 2', '5'],
    ['(1 + 2) * 3', '9'],
    ['7 / 2', '3.5'],
    ['0.1 + 0.2 > 0.3', 'verdadero'],
    ['"hola" + " " + "mundo"', '"hola mundo"'],
    ['"ab" < "b"', 'verdadero'],
    ['verdadero y falso', 'falso'],
    ['verdadero o falso', 'verdadero'],
    ['no verdadero', 'falso'],
    ['!falso', 'verdadero'],
    ['1 < 2 y 5 < 4', 'falso'],
    ['no 1 == 2', 'verdadero'],
    ['1 == 1.0', 'verdadero'],
    ['1 == "1"', 'falso'],
    ['nulo == nulo', 'verdadero'],
    ['[1, [2, 3]] == [1, [2, 3]]', 'verdadero'],
    ['[1, 2] != [2, 1]', 'verdadero'],
    ['[1, "a", verdadero, nulo]', '[1, "a", verdadero, nulo]'],
  ])('%s → %s', (source, expected) => {
    expect(value(source)).toBe(expected);
  });

  test('el valor de un programa es el de su última expresión', () => {
    expect(value('variable x = 2; x * 10; x + 1;')).toBe('3');
    expect(value('variable x = 2;')).toBe('nulo');
  });

  test('`regresa` en el programa principal lo termina', () => {
    expect(value('regresa 1; 2;')).toBe('1');
  });

  test('`y` y `o` evalúan en cortocircuito', () => {
    // Si se evaluara el lado derecho, la división entre cero fallaría.
    expect(value('falso y 1 / 0 == 1')).toBe('falso');
    expect(value('verdadero o 1 / 0 == 1')).toBe('verdadero');
  });
});

describe('variables y alcance', () => {
  test('declarar, leer y reasignar', () => {
    expect(value('variable x = 1; x = x + 1; x;')).toBe('2');
  });

  test('asignación compuesta', () => {
    expect(value('variable x = 10; x += 5; x -= 3; x *= 2; x /= 4; x;')).toBe('6');
  });

  test('las variables declaradas en un bloque no existen fuera de él', () => {
    expect(failure('si (verdadero) { variable dentro = 1; } dentro;').code).toBe('NOMBRE_DESCONOCIDO');
  });

  test('un bloque puede cambiar variables de afuera', () => {
    expect(value('variable x = 1; si (verdadero) { x = 2; } x;')).toBe('2');
  });

  test('un bloque interno puede ocultar una variable externa', () => {
    expect(value('variable x = 1; si (verdadero) { variable x = 2; } x;')).toBe('1');
  });

  test('no se puede declarar dos veces en el mismo bloque', () => {
    expect(failure('variable x = 1; variable x = 2;').code).toBe('VARIABLE_REPETIDA');
  });

  test('no se puede asignar a una variable sin declararla', () => {
    const error = failure('contador = 1;');
    expect(error.code).toBe('VARIABLE_NO_DECLARADA');
    expect(error.hint).toContain('variable contador');
  });

  test('sugiere nombres parecidos', () => {
    expect(failure('variable contador = 1; contadr + 1;').hint).toContain('`contador`');
    expect(failure('imprmir(1);').hint).toContain('`imprimir`');
  });

  test('una variable puede ocultar un procedimiento de la biblioteca', () => {
    expect(value('variable longitud = 3; longitud;')).toBe('3');
  });
});

describe('control de flujo', () => {
  test('si / pero_si / si_no', () => {
    const program = (edad: number) => `
      variable edad = ${edad};
      variable etapa = "";
      si (edad >= 18) { etapa = "adulto"; }
      pero_si (edad >= 13) { etapa = "adolescente"; }
      pero_si (edad >= 6) { etapa = "niño"; }
      si_no { etapa = "infante"; }
      etapa;`;
    expect(value(program(20))).toBe('"adulto"');
    expect(value(program(15))).toBe('"adolescente"');
    expect(value(program(8))).toBe('"niño"');
    expect(value(program(2))).toBe('"infante"');
  });

  test('mientras', () => {
    expect(value('variable i = 0; mientras (i < 5) { i += 1; } i;')).toBe('5');
  });

  test('hacer … hasta_que se ejecuta al menos una vez', () => {
    expect(value('variable vueltas = 0; hacer { vueltas += 1; } hasta_que (verdadero); vueltas;')).toBe('1');
    expect(value('variable i = 0; hacer { i += 2; } hasta_que (i >= 7); i;')).toBe('8');
  });

  test('para', () => {
    expect(value('variable suma = 0; para (variable i = 1; i <= 10; i += 1) { suma += i; } suma;')).toBe('55');
  });

  test('la variable de un `para` solo existe dentro del bucle', () => {
    expect(failure('para (variable i = 0; i < 2; i += 1) { } i;').code).toBe('NOMBRE_DESCONOCIDO');
  });

  test('bucles anidados', () => {
    const source = `
      variable pares = 0;
      para (variable i = 0; i < 4; i += 1) {
        para (variable j = 0; j < 4; j += 1) {
          si (i < j) { pares += 1; }
        }
      }
      pares;`;
    expect(value(source)).toBe('6');
  });

  test.each([
    ['si (1) { }', 'si'],
    ['mientras ("sí") { }', 'mientras'],
    ['hacer { } hasta_que (nulo);', 'hasta_que'],
    ['para (variable i = 0; [i]; i += 1) { }', 'para'],
  ])('las condiciones deben ser lógicas: %s', (source, label) => {
    const error = failure(source);
    expect(error.code).toBe('CONDICIÓN_NO_LÓGICA');
    expect(error.message).toContain(`\`${label}\``);
    expect(error.hint).toBeDefined();
  });

  test('`y`, `o` y `no` también exigen valores lógicos', () => {
    expect(failure('1 y verdadero').code).toBe('OPERANDO_NO_LÓGICO');
    expect(failure('verdadero y 1').code).toBe('OPERANDO_NO_LÓGICO');
    expect(failure('no 0').code).toBe('TIPO_INVÁLIDO');
  });
});

describe('procedimientos', () => {
  test('llamar y regresar', () => {
    expect(value('variable suma = procedimiento(a, b) { regresa a + b; }; suma(2, 3);')).toBe('5');
  });

  test('sin `regresa`, un procedimiento regresa nulo', () => {
    expect(value('variable f = procedimiento() { 1 + 1; }; f();')).toBe('nulo');
    expect(value('variable f = procedimiento() { regresa; }; f();')).toBe('nulo');
  });

  test('se pueden llamar al momento de crearlos', () => {
    expect(value('procedimiento() { regresa "hola"; }();')).toBe('"hola"');
  });

  test('closures: recuerdan las variables de donde se crearon', () => {
    const source = `
      variable crear_contador = procedimiento() {
        variable cuenta = 0;
        regresa procedimiento() { cuenta += 1; regresa cuenta; };
      };
      variable contar = crear_contador();
      contar(); contar();
      contar();`;
    expect(value(source)).toBe('3');
  });

  test('procedimientos como argumentos', () => {
    expect(
      value(
        'variable aplicar = procedimiento(f, x) { regresa f(x); }; aplicar(procedimiento(n) { regresa n * n; }, 4);',
      ),
    ).toBe('16');
  });

  test('recursión', () => {
    expect(
      value('variable fib = procedimiento(n) { si (n < 2) { regresa n; } regresa fib(n - 1) + fib(n - 2); }; fib(20);'),
    ).toBe('6765');
  });

  test('recursión profunda sin depender de la pila de JavaScript', () => {
    const source =
      'variable cuenta = procedimiento(n) { si (n == 0) { regresa 0; } regresa 1 + cuenta(n - 1); }; cuenta(9999);';
    expect(value(source)).toBe('9999');
  });

  test('la cantidad de argumentos tiene que coincidir', () => {
    const error = failure('variable suma = procedimiento(a, b) { regresa a + b; }; suma(1);');
    expect(error.code).toBe('CANTIDAD_DE_ARGUMENTOS');
    expect(error.message).toBe('`suma` espera 2 valores, pero recibió 1.');
  });

  test('un parámetro no se puede volver a declarar en el cuerpo', () => {
    expect(failure('variable f = procedimiento(x) { variable x = 1; }; f(2);').code).toBe('VARIABLE_REPETIDA');
  });

  test('solo se pueden llamar procedimientos', () => {
    const error = failure('variable x = 5; x();');
    expect(error.code).toBe('NO_ES_PROCEDIMIENTO');
    expect(error.message).toContain('es un número');
  });

  test('el error dice en qué procedimiento ocurrió', () => {
    const error = failure('variable dividir = procedimiento(a, b) { regresa a / b; }; dividir(1, 0);');
    expect(error.callStack).toEqual(['programa', 'dividir']);
  });
});

describe('listas y textos', () => {
  test('índices desde el inicio y desde el final', () => {
    expect(value('variable l = [10, 20, 30]; l[0] + l[-1];')).toBe('40');
    expect(value('"hola"[1]')).toBe('"o"');
  });

  test('las listas se comparten, no se copian', () => {
    expect(value('variable a = [1]; variable b = a; agregar(b, 2); a;')).toBe('[1, 2]');
  });

  test('errores de índice', () => {
    const outOfRange = failure('variable l = [1, 2, 3]; l[5];');
    expect(outOfRange.code).toBe('ÍNDICE_FUERA_DE_RANGO');
    expect(outOfRange.message).toBe('El índice 5 está fuera de la lista, que tiene 3 elementos.');
    expect(failure('[1][0.5]').code).toBe('ÍNDICE_INVÁLIDO');
    expect(failure('5[0]').code).toBe('ÍNDICE_NO_SOPORTADO');
  });
});

describe('errores de tipos y aritmética', () => {
  test('dividir entre cero', () => {
    const error = failure('variable x = 0;\n10 / x;');
    expect(error.code).toBe('DIVISIÓN_ENTRE_CERO');
    expect(error.span?.start).toMatchObject({ line: 2, column: 6 });
    expect(failure('variable x = 1; x /= 0;').code).toBe('DIVISIÓN_ENTRE_CERO');
  });

  test('no se mezclan textos y números con `+`', () => {
    const error = failure('"Total: " + 5');
    expect(error.code).toBe('TIPOS_MEZCLADOS');
    expect(error.hint).toContain('texto(');
  });

  test('comparaciones entre tipos distintos', () => {
    expect(failure('1 < "2"').code).toBe('COMPARACIÓN_INVÁLIDA');
    expect(failure('verdadero - 1').code).toBe('TIPO_INVÁLIDO');
    expect(failure('-"a"').code).toBe('TIPO_INVÁLIDO');
  });
});

describe('límites', () => {
  test('un bucle infinito se detiene con un error de límite', () => {
    const error = failure('mientras (verdadero) { }', { maxOperations: 10_000 });
    expect(error.kind).toBe('límite');
    expect(error.code).toBe('DEMASIADAS_OPERACIONES');
  });

  test('recursión sin caso base', () => {
    const error = failure('variable f = procedimiento() { regresa f(); }; f();', { maxCallDepth: 500 });
    expect(error.code).toBe('DEMASIADAS_LLAMADAS');
    expect(error.hint).toContain('caso base');
  });

  test('demasiada salida', () => {
    const error = failure('mientras (verdadero) { imprimir("hola"); }', { maxOutput: 100 });
    expect(error.code).toBe('DEMASIADA_SALIDA');
  });

  test('el número de operaciones es determinista', () => {
    const source = 'variable s = 0; para (variable i = 0; i < 100; i += 1) { s += i; } s;';
    expect(run(source).operations).toBe(run(source).operations);
  });
});

describe('nivel principiante (paso 4)', () => {
  test.each([
    ['7 div 2', '3'],
    ['-7 div 2', '-4'],
    ['7 mod 3', '1'],
    ['-7 mod 3', '2'],
    ['7 % -3', '-2'],
    ['10 % 4 == 10 mod 4', 'verdadero'],
    ['2 ^ 10', '1024'],
    ['-2 ^ 2', '-4'],
    ['(-2) ^ 2', '4'],
    ['2 ^ 3 ^ 2', '512'],
    ['2 ^ -1', '0.5'],
    ['1_000_000 + 1', '1000001'],
    ['3 es_menor_que 4', 'verdadero'],
    ['3 es_mayor_que 4', 'falso'],
    ['4 es_menor_o_igual_a 4', 'verdadero'],
    ['4 es_mayor_o_igual_a 5', 'falso'],
    ['"a" es_igual_a "a"', 'verdadero'],
    ['"a" es_distinto_de "a"', 'falso'],
  ])('%s → %s', (source, expected) => {
    expect(value(source)).toBe(expected);
  });

  test('`a == (a div b) * b + (a mod b)`', () => {
    for (const [a, b] of [
      [7, 2],
      [-7, 2],
      [7, -2],
      [-7, -3],
    ]) {
      expect(value(`(${a}) == ((${a}) div (${b})) * (${b}) + ((${a}) mod (${b}))`)).toBe('verdadero');
    }
  });

  test.each(['5 div 0', '5 mod 0', '5 % 0', 'variable x = 5; x %= 0;'])('%s → DIVISIÓN_ENTRE_CERO', source => {
    expect(failure(source).code).toBe('DIVISIÓN_ENTRE_CERO');
  });

  test('`mod`, `div` y `^` solo trabajan con números', () => {
    expect(failure('"a" mod 2').code).toBe('TIPO_INVÁLIDO');
    expect(failure('2 ^ "a"').code).toBe('TIPO_INVÁLIDO');
  });

  test('una potencia sin resultado real es un error', () => {
    const error = failure('(-8) ^ 0.5');
    expect(error.code).toBe('POTENCIA_INVÁLIDA');
    expect(error.message).toContain('(-8) ^ 0.5');
  });

  test('`++`, `--` y `%=`', () => {
    expect(value('variable i = 5; i++; i++; i--; i;')).toBe('6');
    expect(value('variable x = 17; x %= 5; x;')).toBe('2');
    expect(value('variable s = 0; para (variable i = 0; i < 4; i++) { s += i; } s;')).toBe('6');
    expect(failure('j++;').code).toBe('VARIABLE_NO_DECLARADA');
    expect(failure('variable t = "a"; t++;').code).toBe('TIPOS_MEZCLADOS');
  });

  describe('repetir', () => {
    test('repite el bloque n veces', () => {
      expect(value('variable c = 0; repetir 4 veces { c++; } c;')).toBe('4');
      expect(value('variable n = 3; variable c = 0; repetir n * 2 veces { c++; } c;')).toBe('6');
      expect(value('variable c = 0; repetir 3 veces { repetir 2 veces { c++; } } c;')).toBe('6');
    });

    test('0 veces no ejecuta el bloque', () => {
      expect(value('repetir 0 veces { 1 / 0; } 5;')).toBe('5');
    });

    test('la cantidad se evalúa una sola vez', () => {
      expect(value('variable n = 3; variable c = 0; repetir n veces { n++; c++; } c;')).toBe('3');
    });

    test('el contador es interno: no crea ninguna variable', () => {
      const result = run('repetir 2 veces { }', { trace: true });
      expect(result.events!.filter(event => event.type === 'declara')).toEqual([]);
    });

    test('`regresa` dentro de `repetir` sale del procedimiento', () => {
      expect(value('variable f = procedimiento() { repetir 5 veces { regresa 1; } regresa 2; }; f() + f();')).toBe('2');
    });

    test.each([
      ['repetir -1 veces { }', 'negativa'],
      ['repetir 2.5 veces { }', 'redondear'],
      ['repetir "3" veces { }', 'número(…)'],
    ])('%s → REPETICIONES_INVÁLIDAS', (source, hint) => {
      const error = failure(source);
      expect(error.code).toBe('REPETICIONES_INVÁLIDAS');
      expect(error.hint).toContain(hint);
      expect(error.span?.start.column).toBe(9);
    });
  });

  describe('constante', () => {
    test('se declara y se lee como una variable', () => {
      expect(value('constante LADOS = 4; LADOS * 2;')).toBe('8');
    });

    test.each([
      'constante K = 1; K = 2;',
      'constante K = 1; K += 1;',
      'constante K = 1; K++;',
      'constante K = 1; K--;',
    ])('%s → CONSTANTE_REASIGNADA', source => {
      const error = failure(source);
      expect(error.code).toBe('CONSTANTE_REASIGNADA');
      expect(error.hint).toContain('variable K');
    });

    test('reasignarla desde un bloque interno también es un error', () => {
      expect(failure('constante K = 1; si (verdadero) { K = 2; }').code).toBe('CONSTANTE_REASIGNADA');
    });

    test('un bloque interno puede declarar su propia variable con el mismo nombre', () => {
      expect(value('constante K = 1; si (verdadero) { variable K = 2; K = 3; } K;')).toBe('1');
    });
  });

  describe('PI', () => {
    test('es una constante de la biblioteca', () => {
      expect(value('redondear(PI, 4)')).toBe('3.1416');
    });

    test('una variable del usuario puede ocultarla', () => {
      expect(value('constante PI = 3.14159; PI;')).toBe('3.14159');
      expect(value('variable PI = 3; PI;')).toBe('3');
    });

    test('no se le puede asignar sin declararla', () => {
      expect(failure('PI = 3;').code).toBe('NOMBRE_RESERVADO_POR_BIBLIOTECA');
    });
  });
});

describe('nivel intermedio (paso 5)', () => {
  describe('procedimientos con nombre', () => {
    test('se declaran y se llaman', () => {
      expect(value('procedimiento área(base, altura) { regresa base * altura; }\nárea(3, 4);')).toBe('12');
    });

    test('se pueden usar antes de su declaración (recursión mutua)', () => {
      expect(
        value(`
          es_par(10);
          procedimiento es_par(n) { si (n == 0) { regresa verdadero; } regresa es_impar(n - 1); }
          procedimiento es_impar(n) { si (n == 0) { regresa falso; } regresa es_par(n - 1); }
        `),
      ).toBe('verdadero');
    });

    test('solo existen dentro de su bloque', () => {
      expect(value('si (verdadero) { procedimiento f() { regresa 1; } } variable f = 2; f;')).toBe('2');
      expect(failure('si (verdadero) { procedimiento f() { regresa 1; } } f();').code).toBe('NOMBRE_DESCONOCIDO');
    });

    test('capturan las variables de su bloque', () => {
      expect(value('variable base = 10; procedimiento sumar(x) { regresa base + x; } base = 20; sumar(1);')).toBe('21');
    });

    test('se pueden pasar como valor', () => {
      expect(value('procedimiento doble(x) { regresa x * 2; } variable f = doble; f(4);')).toBe('8');
    });
  });

  describe('para_cada', () => {
    test('recorre listas, textos y rangos', () => {
      expect(value('variable t = 0; para_cada x en [1, 2, 3] { t += x; } t;')).toBe('6');
      expect(value('variable s = ""; para_cada letra en "hola" { s = letra + s; } s;')).toBe('"aloh"');
      expect(value('variable t = 0; para_cada i en rango(1, 10) { t += i; } t;')).toBe('55');
      expect(value('variable c = 0; para_cada x en [] { c++; } c;')).toBe('0');
    });

    test('la variable es nueva en cada vuelta y solo existe dentro del cuerpo', () => {
      expect(failure('para_cada x en [1] { } x;').code).toBe('NOMBRE_DESCONOCIDO');
      expect(
        value('variable fs = []; para_cada x en [1, 2] { agregar(fs, procedimiento() { regresa x; }); } fs[0]();'),
      ).toBe('1');
      expect(failure('para_cada x en [1] { variable x = 2; }').code).toBe('VARIABLE_REPETIDA');
    });

    test('cambiar los elementos sí se permite; cambiar la longitud no', () => {
      expect(value('variable l = [1, 2]; para_cada x en l { l[0] = 5; } l;')).toBe('[5, 2]');
      const error = failure('variable l = [1, 2]; para_cada x en l { agregar(l, x); }');
      expect(error.code).toBe('LISTA_MODIFICADA_AL_RECORRER');
      expect(error.hint).toContain('copia');
    });

    test('solo recorre listas y textos', () => {
      const error = failure('para_cada x en 5 { }');
      expect(error.code).toBe('PARA_CADA_INVÁLIDO');
      expect(error.hint).toContain('rango(1, 5)');
    });
  });

  describe('romper y continuar', () => {
    test.each([
      ['variable i = 0; mientras (verdadero) { i++; si (i == 5) { romper; } } i;', '5'],
      ['variable c = 0; variable i = 0; mientras (i < 10) { i++; si (i mod 2 == 0) { continuar; } c++; } c;', '5'],
      ['variable i = 0; hacer { i++; si (i == 3) { romper; } } hasta_que (i >= 10); i;', '3'],
      [
        'variable i = 0; variable c = 0; hacer { i++; si (i mod 2 == 0) { continuar; } c++; } hasta_que (i >= 10); c;',
        '5',
      ],
      ['variable c = 0; para (variable i = 0; i < 10; i++) { si (i == 4) { romper; } c++; } c;', '4'],
      ['variable c = 0; para (variable i = 0; i < 10; i++) { si (i mod 3 == 0) { continuar; } c++; } c;', '6'],
      ['variable c = 0; repetir 10 veces { c++; si (c == 4) { romper; } } c;', '4'],
      ['variable c = 0; variable v = 0; repetir 6 veces { v++; si (v mod 2 == 0) { continuar; } c++; } c;', '3'],
      ['variable t = 0; para_cada x en [1, 2, 3, 4] { si (x == 3) { romper; } t += x; } t;', '3'],
      ['variable t = 0; para_cada x en [1, 2, 3, 4] { si (x == 3) { continuar; } t += x; } t;', '7'],
    ])('%s → %s', (source, expected) => {
      expect(value(source)).toBe(expected);
    });

    test('solo afectan al bucle más cercano', () => {
      expect(value('variable c = 0; repetir 3 veces { repetir 5 veces { c++; romper; } } c;')).toBe('3');
      expect(
        value(
          'variable c = 0; para_cada x en [1, 2] { para_cada z en [1, 2, 3] { si (z == 2) { continuar; } c++; } } c;',
        ),
      ).toBe('4');
    });

    test('cierran los alcances y limpian la pila del bucle', () => {
      // Si quedaran alcances abiertos, `x` seguiría existiendo; si quedaran valores ocultos, el programa
      // regresaría otra cosa.
      expect(failure('repetir 3 veces { variable x = 1; si (verdadero) { variable w = 2; romper; } } x;').code).toBe(
        'NOMBRE_DESCONOCIDO',
      );
      expect(
        value(
          'variable f = procedimiento() { para_cada x en [1, 2] { repetir 2 veces { romper; } } regresa 7; }; f() + 1;',
        ),
      ).toBe('8');
      expect(value('variable n = 0; repetir 1000 veces { para_cada x en [1, 2, 3] { romper; } n++; } n;')).toBe('1000');
    });
  });

  describe('asignación por índice', () => {
    test('cambia elementos de listas y matrices', () => {
      expect(value('variable l = [1, 2, 3]; l[0] = 10; l[-1] += 5; l[1]++; l;')).toBe('[10, 3, 8]');
      expect(value('variable m = [[1, 2], [3, 4]]; m[1][0] += 1; m;')).toBe('[[1, 2], [4, 4]]');
    });

    test('las listas se comparten', () => {
      expect(value('variable a = [1]; variable b = a; b[0] = 2; a;')).toBe('[2]');
    });

    test('los textos son inmutables', () => {
      const error = failure('variable t = "hola"; t[0] = "H";');
      expect(error.code).toBe('TEXTO_INMUTABLE');
      expect(error.hint).toContain('texto nuevo');
    });

    test.each([
      ['variable l = [1]; l[3] = 2;', 'ÍNDICE_FUERA_DE_RANGO'],
      ['variable l = [1]; l[0.5] = 2;', 'ÍNDICE_INVÁLIDO'],
      ['variable n = 5; n[0] = 2;', 'ÍNDICE_NO_SOPORTADO'],
      ['variable l = ["a"]; l[0] += 1;', 'TIPOS_MEZCLADOS'],
    ])('%s → %s', (source, code) => {
      expect(failure(source).code).toBe(code);
    });
  });

  test('la búsqueda binaria de la §9 de la spec', () => {
    expect(
      value(`
        procedimiento buscar_binaria(lista, objetivo) {
          variable inicio = 0;
          variable fin = longitud(lista) - 1;
          mientras (inicio <= fin) {
            variable medio = (inicio + fin) div 2;
            si (lista[medio] es_igual_a objetivo) {
              regresa medio;
            } pero_si (lista[medio] es_menor_que objetivo) {
              inicio = medio + 1;
            } si_no {
              fin = medio - 1;
            }
          }
          regresa -1;
        }
        [buscar_binaria([1, 3, 5, 7, 9, 11], 7), buscar_binaria([1, 3, 5], 4)];
      `),
    ).toBe('[3, -1]');
  });
});

describe('diccionarios', () => {
  test('se crean, se leen y se cambian', () => {
    expect(value('variable p = { "nombre": "Ana", "edad": 16 }; [p["nombre"], p.edad];')).toBe('["Ana", 16]');
    expect(value('variable p = { "edad": 16 }; p.edad += 1; p.ciudad = "León"; p["n"] = 1; p;')).toBe(
      '{"edad": 17, "ciudad": "León", "n": 1}',
    );
    expect(value('variable d = { 1: "uno" }; d[1];')).toBe('"uno"');
    expect(value('variable k = "x"; variable d = { (k): 1 }; d.x;')).toBe('1');
  });

  test('conservan el orden de inserción', () => {
    expect(value('variable d = { "b": 1 }; d.a = 2; d.b = 3; claves(d);')).toBe('["b", "a"]');
  });

  test('las claves de texto y de número son distintas', () => {
    expect(value('variable d = { 1: "número", "1": "texto" }; [d[1], d["1"], longitud(d)];')).toBe(
      '["número", "texto", 2]',
    );
  });

  test('se comparten como las listas', () => {
    expect(value('variable a = {}; variable b = a; b.x = 1; a;')).toBe('{"x": 1}');
  });

  test('igualdad por valor, sin importar el orden', () => {
    expect(
      value('{ "a": 1, "b": [2] } == { "b": [2], "a": 1 } y {} == {};'.replace(/^/, 'variable r = ') + ' r;'),
    ).toBe('verdadero');
    expect(value('variable r = { "a": 1 } != { "a": 2 }; r;')).toBe('verdadero');
    expect(value('variable r = { "a": 1 } == { "a": 1, "b": 2 }; r;')).toBe('falso');
  });

  test('un diccionario de procedimientos se llama con punto', () => {
    expect(
      value('variable calculadora = { "suma": procedimiento(a, b) { regresa a + b; } }; calculadora.suma(1, 3);'),
    ).toBe('4');
  });

  test('leer una clave que no existe es un error con pista', () => {
    const error = failure('variable p = { "a": 1 }; p.b;');
    expect(error.code).toBe('CLAVE_INEXISTENTE');
    expect(error.hint).toContain('tiene(d, "b")');
    expect(failure('variable p = {}; p["x"] += 1;').code).toBe('CLAVE_INEXISTENTE');
  });

  test.each([
    ['variable d = { [1]: 2 };', 'CLAVE_INVÁLIDA'],
    ['variable d = {}; d[verdadero] = 1;', 'CLAVE_INVÁLIDA'],
    ['variable l = [1]; l.x;', 'ÍNDICE_NO_SOPORTADO'],
    ['variable l = [1]; l.x = 2;', 'ÍNDICE_NO_SOPORTADO'],
    ['variable n = 5; n.x;', 'ÍNDICE_NO_SOPORTADO'],
  ])('%s → %s', (source, code) => {
    expect(failure(source).code).toBe(code);
  });

  describe('para_cada', () => {
    test('con una variable recorre las claves', () => {
      expect(value('variable d = { "a": 1, "b": 2 }; variable s = ""; para_cada k en d { s = s + k; } s;')).toBe(
        '"ab"',
      );
    });

    test('con dos variables recorre claves y valores', () => {
      expect(
        value('variable d = { "a": 1, "b": 2 }; variable s = ""; para_cada k, v en d { s = s + k + texto(v); } s;'),
      ).toBe('"a1b2"');
    });

    test('cambiar valores se permite; agregar o quitar claves no', () => {
      expect(value('variable d = { "a": 1 }; para_cada k en d { d[k] = 5; } d;')).toBe('{"a": 5}');
      expect(failure('variable d = { "a": 1 }; para_cada k en d { d.z = 1; }').code).toBe(
        'DICCIONARIO_MODIFICADO_AL_RECORRER',
      );
      expect(failure('variable d = { "a": 1, "b": 2 }; para_cada k en d { quitar(d, "b"); d.c = 3; }').code).toBe(
        'DICCIONARIO_MODIFICADO_AL_RECORRER',
      );
    });

    test('dos variables solo con diccionarios', () => {
      const error = failure('para_cada i, x en [1] { }');
      expect(error.code).toBe('PARA_CADA_INVÁLIDO');
      expect(error.hint).toContain('para_cada x en');
    });
  });

  test('el recorrido en anchura de la §9 de la spec', () => {
    expect(
      value(`
        procedimiento distancia(grafo, origen, destino) {
          variable visitados = { };
          variable cola = [[origen, 0]];
          visitados[origen] = verdadero;

          mientras (longitud(cola) > 0) {
            variable actual = desencolar(cola);
            si (actual[0] == destino) {
              regresa actual[1];
            }
            para_cada vecino en grafo[actual[0]] {
              si (no tiene(visitados, vecino)) {
                visitados[vecino] = verdadero;
                encolar(cola, [vecino, actual[1] + 1]);
              }
            }
          }
          regresa -1;
        }
        variable grafo = { "a": ["b", "c"], "b": ["d"], "c": ["d", "e"], "d": ["f"], "e": ["f"], "f": [], "g": [] };
        [distancia(grafo, "a", "f"), distancia(grafo, "a", "a"), distancia(grafo, "a", "g")];
      `),
    ).toBe('[3, 0, -1]');
  });
});

describe('nivel avanzado (paso 6)', () => {
  describe('procedimientos que reciben procedimientos', () => {
    test.each([
      ['mapear([1, 2, 3], procedimiento(x) { regresa x * 2; })', '[2, 4, 6]'],
      ['procedimiento doble(x) { regresa x * 2; } mapear([1, 2], doble);', '[2, 4]'],
      ['mapear([], procedimiento(x) { regresa x; })', '[]'],
      ['filtrar([1, 2, 3, 4], procedimiento(x) { regresa x mod 2 == 0; })', '[2, 4]'],
      ['reducir([1, 2, 3], procedimiento(total, x) { regresa total + x; }, 10)', '16'],
      ['reducir([], procedimiento(total, x) { regresa total + x; }, 0)', '0'],
      ['alguno([1, 2], procedimiento(x) { regresa x > 1; })', 'verdadero'],
      ['alguno([], procedimiento(x) { regresa verdadero; })', 'falso'],
      ['todos([1, 2], procedimiento(x) { regresa x > 1; })', 'falso'],
      ['todos([], procedimiento(x) { regresa falso; })', 'verdadero'],
      ['buscar([1, 2, 3], procedimiento(x) { regresa x > 1; })', '2'],
      ['buscar([1], procedimiento(x) { regresa x > 1; })', 'nulo'],
      ['ordenar([3, 1, 2], procedimiento(a, b) { regresa a > b; })', '[3, 2, 1]'],
      [
        'ordenar(["pera", "kiwi", "uva"], procedimiento(a, b) { regresa longitud(a) < longitud(b); })',
        '["uva", "pera", "kiwi"]',
      ],
    ])('%s → %s', (source, expected) => {
      expect(value(source)).toBe(expected);
    });

    test('`ordenar` con comparador es estable', () => {
      expect(
        value(
          'ordenar([[1, "a"], [0, "b"], [1, "c"], [0, "d"], [1, "e"]], procedimiento(a, b) { regresa a[0] < b[0]; })',
        ),
      ).toBe('[[0, "b"], [0, "d"], [1, "a"], [1, "c"], [1, "e"]]');
    });

    test('capturan variables y pueden cambiar las de afuera', () => {
      expect(value('variable cuenta = 0; mapear([1, 2, 3], procedimiento(x) { cuenta++; regresa x; }); cuenta;')).toBe(
        '3',
      );
    });

    test('pueden anidarse', () => {
      expect(
        value(
          'mapear([[1, 2], [3]], procedimiento(fila) { regresa mapear(fila, procedimiento(x) { regresa x * 10; }); })',
        ),
      ).toBe('[[10, 20], [30]]');
    });

    test('una variable del usuario puede ocultarlos', () => {
      expect(value('variable mapear = 1; mapear;')).toBe('1');
      expect(failure('mapear = 1;').code).toBe('NOMBRE_RESERVADO_POR_BIBLIOTECA');
    });

    test('los ayudantes internos no se ven desde el programa', () => {
      expect(failure('revisar_lista("x", 1);').code).toBe('NOMBRE_DESCONOCIDO');
      expect(failure('ordenar_natural([1]);').code).toBe('NOMBRE_DESCONOCIDO');
    });

    test.each([
      ['mapear(5, procedimiento(x) { regresa x; })', 'TIPO_DE_ARGUMENTO', 'lista'],
      ['mapear([1], 5)', 'TIPO_DE_ARGUMENTO', 'sin paréntesis'],
      ['filtrar([1], procedimiento(x) { regresa x; })', 'TIPO_DE_ARGUMENTO', 'regresa'],
      ['ordenar([1, 2], procedimiento(a, b) { regresa a - b; })', 'TIPO_DE_ARGUMENTO', 'va `a` antes'],
      ['mapear([1], procedimiento(a, b) { regresa a; })', 'CANTIDAD_DE_ARGUMENTOS', '`mapear` llama'],
    ])('%s → %s', (source, code, hint) => {
      const error = failure(source);
      expect(error.code).toBe(code);
      expect((error.hint ?? '') + error.message).toContain(hint);
      // El error se ubica en la llamada del programa, no en el código de la biblioteca.
      expect(error.span?.start).toEqual({ line: 1, column: 1, offset: 0 });
    });

    test('un error dentro de `f` muestra la pila completa y su lugar en el programa', () => {
      const error = failure('variable l = [1, 0];\nmapear(l, procedimiento(x) {\n  regresa 1 / x;\n});');
      expect(error.code).toBe('DIVISIÓN_ENTRE_CERO');
      expect(error.callStack).toEqual(['programa', 'mapear', 'f']);
      expect(error.span?.start.line).toBe(3);
    });

    test('la pila no muestra los procedimientos internos de la biblioteca', () => {
      const error = failure('ordenar([2, 1], procedimiento(a, b) { regresa a / (b - b) < 1; });');
      expect(error.callStack).toEqual(['programa', 'ordenar', 'va_antes']);
    });

    test('las llamadas a `f` cuentan para el límite de llamadas', () => {
      const program =
        'variable f = procedimiento(n) { si (n == 0) { regresa 0; } regresa mapear([n - 1], f)[0]; }; f(50);';
      expect(value(program)).toBe('0');
      expect(run(program, { maxCallDepth: 40 }).errors[0]!.code).toBe('DEMASIADAS_LLAMADAS');
    });
  });

  describe('pilas y colas', () => {
    test('una pila: el último que entra es el primero que sale', () => {
      expect(value('variable p = []; apilar(p, 1); apilar(p, 2); [tope(p), desapilar(p), desapilar(p), p];')).toBe(
        '[2, 2, 1, []]',
      );
    });

    test('una cola: el primero que entra es el primero que sale', () => {
      expect(
        value('variable c = []; encolar(c, 1); encolar(c, 2); [frente(c), desencolar(c), desencolar(c), c];'),
      ).toBe('[1, 1, 2, []]');
    });

    test.each([
      ['desapilar([])', 'PILA_VACÍA', 'No se puede `desapilar` de una pila vacía.'],
      ['tope([])', 'PILA_VACÍA', 'Una pila vacía no tiene `tope`.'],
      ['desencolar([])', 'COLA_VACÍA', 'No se puede `desencolar` de una cola vacía.'],
      ['frente([])', 'COLA_VACÍA', 'Una cola vacía no tiene `frente`.'],
      ['apilar(5, 1)', 'TIPO_DE_ARGUMENTO', '`apilar` espera una pila (una lista), pero recibió un número.'],
    ])('%s → %s', (source, code, message) => {
      const error = failure(source);
      expect(error.code).toBe(code);
      expect(error.message).toBe(message);
    });
  });

  describe('costo por operación', () => {
    const operations = (source: string) => run(source).operations;

    test('la biblioteca cobra según la tabla de costos', () => {
      const list = '[8, 7, 6, 5, 4, 3, 2, 1]';
      // `ordenar` de 8 elementos cuesta 8 · 3 = 24; `primero` cuesta 1.
      expect(operations(`ordenar(${list});`) - operations(`primero(${list});`)).toBe(23);
      // `contiene` cuesta 8 y recibe un argumento más (1 operación).
      expect(operations(`contiene(${list}, 1);`) - operations(`primero(${list});`)).toBe(8);
    });

    test('`mapear` cobra `n` más lo que cuesta cada llamada a `f`', () => {
      const one = operations('mapear([1], procedimiento(x) { regresa x; });');
      const three = operations('mapear([1, 2, 3], procedimiento(x) { regresa x; });');
      // Dos elementos más en la lista literal, dos unidades más de costo y dos llamadas más a `f`, cuyo
      // cuerpo cuesta 2 (leer `x` y regresar). La llamada en sí ocurre dentro de la biblioteca.
      expect(three - one).toBe(2 + 2 + 2 * 2);
    });

    test('la cuenta es determinista', () => {
      const program =
        'ordenar(mapear(rango(1, 50), procedimiento(x) { regresa (x * 37) mod 11; }), procedimiento(a, b) { regresa a < b; });';
      expect(operations(program)).toBe(operations(program));
    });

    test('el límite de operaciones también corta dentro de `f`', () => {
      const result = run('mapear([1], procedimiento(x) { mientras (verdadero) { } });', { maxOperations: 1000 });
      expect(result.errors[0]!.code).toBe('DEMASIADAS_OPERACIONES');
      expect(result.errors[0]!.callStack).toEqual(['programa', 'mapear', 'f']);
    });
  });

  test('un recorrido en profundidad recursivo sobre 5 000 nodos funciona con los límites por defecto', () => {
    expect(
      value(`
        variable grafo = {};
        para_cada i en rango(0, 4999) {
          grafo[i] = [];
          si (i > 0) {
            agregar(grafo[i - 1], i);
          }
        }
        variable visitados = {};
        procedimiento visitar(nodo) {
          visitados[nodo] = verdadero;
          para_cada vecino en grafo[nodo] {
            si (no tiene(visitados, vecino)) {
              visitar(vecino);
            }
          }
        }
        visitar(0);
        longitud(visitados);
      `),
    ).toBe('5000');
  });
});

describe('dominios', () => {
  test('el ejemplo de #19', () => {
    expect(
      value(`
        dominio calculadora {
          variable suma = procedimiento(a, b) {
            variable total = a + b;
            regresa total;
          };
        }
        variable sumado = calculadora.suma(1, 3);
        sumado;
      `),
    ).toBe('4');
  });

  test('los miembros se usan sin prefijo dentro y con punto fuera', () => {
    expect(
      value(`
        dominio c {
          constante FACTOR = 2;
          procedimiento doble(x) { regresa x * FACTOR; }
          procedimiento cuádruple(x) { regresa doble(doble(x)); }
        }
        [c.cuádruple(3), c.FACTOR];
      `),
    ).toBe('[12, 2]');
  });

  test('pueden contener otros dominios', () => {
    expect(
      value(
        'dominio geometría { dominio círculo { procedimiento área(r) { regresa 3 * r ^ 2; } } }\ngeometría.círculo.área(2);',
      ),
    ).toBe('12');
  });

  test('sus procedimientos ven lo de afuera y guardan su estado en el dominio', () => {
    expect(value('variable base = 10; dominio c { procedimiento sumar(x) { regresa base + x; } } c.sumar(1);')).toBe(
      '11',
    );
    expect(
      value(
        'dominio contador { variable n = 0; procedimiento contar() { n++; regresa n; } } contador.contar(); contador.contar();',
      ),
    ).toBe('2');
  });

  test('desde fuera solo se cambian sus variables', () => {
    expect(value('dominio c { variable n = 1; procedimiento leer_n() { regresa n; } } c.n += 4; c.leer_n();')).toBe(
      '5',
    );
    const constant = failure('dominio c { constante K = 1; } c.K = 2;');
    expect(constant.code).toBe('MIEMBRO_DE_SOLO_LECTURA');
    expect(constant.hint).toContain('`variable`');
    expect(failure('dominio c { procedimiento f() { } } c.f = 1;').code).toBe('MIEMBRO_DE_SOLO_LECTURA');
    expect(failure('dominio c { dominio d { } } c.d = 1;').code).toBe('MIEMBRO_DE_SOLO_LECTURA');
  });

  test('no se le pueden agregar miembros', () => {
    const error = failure('dominio c { } c.nuevo = 1;');
    expect(error.code).toBe('MIEMBRO_INEXISTENTE');
    expect(error.hint).toContain('no se pueden agregar');
  });

  test('un miembro mal escrito sugiere el correcto', () => {
    const error = failure('dominio c { variable total = 1; } c.totl;');
    expect(error.code).toBe('MIEMBRO_INEXISTENTE');
    expect(error.hint).toBe('¿Quisiste decir `c.total`?');
  });

  test('se usa con punto, no con corchetes', () => {
    const error = failure('dominio c { variable a = 1; } c["a"];');
    expect(error.code).toBe('ÍNDICE_NO_SOPORTADO');
    expect(error.hint).toBe('Escribe `c.a`.');
  });

  test('es un valor con referencia', () => {
    expect(value('dominio c { } [tipo(c), texto(c)];')).toBe('["dominio", "dominio c"]');
    expect(value('dominio c { variable x = 1; } variable d = c; d.x = 5; [c.x, c == d];')).toBe('[5, verdadero]');
  });

  test('su nombre no se reasigna ni se repite', () => {
    const error = failure('dominio c { } c = 1;');
    expect(error.code).toBe('CONSTANTE_REASIGNADA');
    expect(error.message).toContain('es un dominio');
    expect(failure('dominio c { } dominio c { }').code).toBe('VARIABLE_REPETIDA');
  });

  test('lo declarado dentro no existe fuera sin el prefijo', () => {
    expect(failure('dominio c { variable x = 1; } x;').code).toBe('NOMBRE_DESCONOCIDO');
  });

  test('no es un diccionario', () => {
    expect(failure('dominio c { variable x = 1; } para_cada m en c { }').code).toBe('PARA_CADA_INVÁLIDO');
    expect(run('dominio c { } longitud(c);').errors[0]!.code).toBe('TIPO_DE_ARGUMENTO');
  });
});
