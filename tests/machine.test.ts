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
