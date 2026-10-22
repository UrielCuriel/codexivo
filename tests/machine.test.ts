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
    expect(value('variable veces = 0; hacer { veces += 1; } hasta_que (verdadero); veces;')).toBe('1');
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
