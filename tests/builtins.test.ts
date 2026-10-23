import { describe, expect, test } from 'bun:test';
import { natives, run } from '../src';

const value = (source: string): string => {
  const result = run(source);
  if (!result.ok) throw new Error(result.errors.map(error => `${error.code}: ${error.message}`).join('\n'));
  return result.resultText;
};

const errorCode = (source: string) => run(source).errors[0]?.code;

describe('biblioteca estándar', () => {
  describe('imprimir y leer', () => {
    test('imprimir separa los valores con un espacio y termina la línea', () => {
      expect(run('imprimir("Total:", 5, [1, "a"]); imprimir();').output).toBe('Total: 5 [1, "a"]\n\n');
    });

    test('leer regresa la siguiente línea, o nulo si ya no hay', () => {
      const result = run('imprimir(leer()); imprimir(leer()); leer();', { input: 'Ana\nLuis' });
      expect(result.output).toBe('Ana\nLuis\n');
      expect(result.resultText).toBe('nulo');
    });

    test('leer_número convierte la línea en número', () => {
      expect(run('leer_número() + leer_número();', { input: ['2', ' 3.5 '] }).resultText).toBe('5.5');
      expect(run('leer_número();', { input: ['dos'] }).errors[0]?.code).toBe('NO_ES_NÚMERO');
      expect(run('leer_número();').errors[0]?.code).toBe('SIN_ENTRADA');
    });
  });

  describe('tipos y conversiones', () => {
    test.each([
      ['tipo(1)', '"número"'],
      ['tipo("a")', '"texto"'],
      ['tipo(falso)', '"lógico"'],
      ['tipo(nulo)', '"nulo"'],
      ['tipo([])', '"lista"'],
      ['tipo(imprimir)', '"procedimiento"'],
      ['texto(42) + "!"', '"42!"'],
      ['número("3.5") * 2', '7'],
      ['longitud("año")', '3'],
      ['longitud([1, 2, 3])', '3'],
    ])('%s → %s', (source, expected) => {
      expect(value(source)).toBe(expected);
    });

    test('errores de conversión', () => {
      expect(errorCode('número("abc")')).toBe('NO_ES_NÚMERO');
      expect(errorCode('longitud(5)')).toBe('TIPO_DE_ARGUMENTO');
    });
  });

  describe('matemáticas', () => {
    test.each([
      ['absoluto(-3)', '3'],
      ['máximo(3, 9, 2)', '9'],
      ['mínimo([4, 1, 7])', '1'],
      ['redondear(2.5)', '3'],
      ['redondear(-2.5)', '-3'],
      ['redondear(3.14159, 2)', '3.14'],
    ])('%s → %s', (source, expected) => {
      expect(value(source)).toBe(expected);
    });

    test('máximo y mínimo necesitan al menos un número', () => {
      expect(errorCode('máximo([])')).toBe('LISTA_VACÍA');
      expect(errorCode('máximo(1, "a")')).toBe('TIPO_DE_ARGUMENTO');
    });
  });

  describe('diccionarios', () => {
    test.each([
      ['claves({ "a": 1, 2: "b" })', '["a", 2]'],
      ['valores({ "a": 1, 2: "b" })', '[1, "b"]'],
      ['tiene({ "a": 1 }, "a")', 'verdadero'],
      ['tiene({ "1": 1 }, 1)', 'falso'],
      ['longitud({ "a": 1, "b": 2 })', '2'],
      ['tipo({})', '"diccionario"'],
      ['texto({ "a": [1] })', '"{\\"a\\": [1]}"'],
    ])('%s → %s', (source, expected) => {
      expect(value(source)).toBe(expected);
    });

    test('quitar decide por tipo y regresa lo que quitó', () => {
      expect(value('variable d = { "a": 1, "b": 2 }; [quitar(d, "a"), d];')).toBe('[1, {"b": 2}]');
      expect(value('variable l = [1, 2, 3]; [quitar(l, 0), quitar(l, -1), l];')).toBe('[1, 3, [2]]');
    });

    test('errores', () => {
      expect(errorCode('claves([1])')).toBe('TIPO_DE_ARGUMENTO');
      expect(errorCode('tiene({}, [1])')).toBe('CLAVE_INVÁLIDA');
      expect(errorCode('quitar({}, "x")')).toBe('CLAVE_INEXISTENTE');
      expect(errorCode('quitar([1], 5)')).toBe('ÍNDICE_FUERA_DE_RANGO');
      expect(errorCode('quitar([1], "a")')).toBe('ÍNDICE_INVÁLIDO');
      expect(errorCode('quitar("abc", 0)')).toBe('TIPO_DE_ARGUMENTO');
    });
  });

  describe('rango e índices', () => {
    test.each([
      ['rango(1, 5)', '[1, 2, 3, 4, 5]'],
      ['rango(0, 10, 5)', '[0, 5, 10]'],
      ['rango(10, 1, -3)', '[10, 7, 4, 1]'],
      ['rango(0, 1, 0.25)', '[0, 0.25, 0.5, 0.75, 1]'],
      ['rango(5, 1)', '[]'],
      ['rango(3, 3)', '[3]'],
      ['índices([7, 8, 9])', '[0, 1, 2]'],
      ['indices("ab")', '[0, 1]'],
      ['índices([])', '[]'],
    ])('%s → %s', (source, expected) => {
      expect(value(source)).toBe(expected);
    });

    test('errores', () => {
      expect(errorCode('rango(1, 3, 0)')).toBe('RANGO_PASO_CERO');
      expect(errorCode('rango(1, "3")')).toBe('TIPO_DE_ARGUMENTO');
      expect(errorCode('rango(1, 100000000)')).toBe('RANGO_DEMASIADO_GRANDE');
      expect(errorCode('índices(5)')).toBe('TIPO_DE_ARGUMENTO');
      expect(errorCode('rango(1)')).toBe('CANTIDAD_DE_ARGUMENTOS');
    });
  });

  describe('listas', () => {
    test('agregar cambia la lista', () => {
      expect(value('variable l = [1]; agregar(l, 2); l;')).toBe('[1, 2]');
    });

    test('primero y último', () => {
      expect(value('primero([3, 4, 5]) + último([3, 4, 5])')).toBe('8');
      expect(errorCode('primero([])')).toBe('LISTA_VACÍA');
    });
  });

  test('los nombres con acento también se aceptan sin él', () => {
    expect(value('maximo(1, 2) + minimo(1, 2) + ultimo([3])')).toBe('6');
  });

  test('la cantidad de argumentos se valida', () => {
    expect(run('longitud("a", "b")').errors[0]?.message).toBe('`longitud` espera 1 valor, pero recibió 2.');
    expect(run('redondear()').errors[0]?.message).toBe('`redondear` espera entre 1 y 2 valores, pero recibió 0.');
    expect(run('máximo()').errors[0]?.message).toBe('`máximo` espera al menos 1 valor, pero recibió 0.');
  });

  describe('matemáticas (paso 5)', () => {
    test.each([
      ['piso(2.7)', '2'],
      ['piso(-2.1)', '-3'],
      ['techo(2.1)', '3'],
      ['techo(-2.7)', '-2'],
      ['entero(2.7)', '2'],
      ['entero(-2.7)', '-2'],
      ['raíz(9)', '3'],
      ['raiz(2.25)', '1.5'],
    ])('%s → %s', (source, expected) => {
      expect(value(source)).toBe(expected);
    });

    test('errores', () => {
      expect(errorCode('piso("a")')).toBe('TIPO_DE_ARGUMENTO');
      expect(errorCode('techo(nulo)')).toBe('TIPO_DE_ARGUMENTO');
      expect(errorCode('entero([1])')).toBe('TIPO_DE_ARGUMENTO');
      expect(errorCode('raíz(-1)')).toBe('RAÍZ_DE_NEGATIVO');
      expect(run('raíz(-4)').errors[0]!.hint).toContain('absoluto');
    });
  });

  describe('aleatorio', () => {
    const program = 'variable l = []; repetir 20 veces { agregar(l, aleatorio(1, 6)); } l;';

    test('es entero, inclusivo y se queda entre los límites', () => {
      const items = JSON.parse(run(program, { seed: 7 }).resultText) as number[];
      expect(items).toHaveLength(20);
      expect(items.every(item => Number.isInteger(item) && item >= 1 && item <= 6)).toBe(true);
      expect(value('aleatorio(3, 3)')).toBe('3');
    });

    test('la misma semilla repite la ejecución', () => {
      const first = run(program, { seed: 42 });
      expect(run(program, { seed: 42 }).resultText).toBe(first.resultText);
      expect(first.seed).toBe(42);
      expect(run(program, { seed: 43 }).resultText).not.toBe(first.resultText);
    });

    test('sin semilla, la máquina elige una y la expone para repetir la ejecución', () => {
      const first = run(program);
      expect(typeof first.seed).toBe('number');
      expect(run(program, { seed: first.seed }).resultText).toBe(first.resultText);
    });

    test('errores', () => {
      expect(errorCode('aleatorio(6, 1)')).toBe('TIPO_DE_ARGUMENTO');
      expect(errorCode('aleatorio(1.5, 3)')).toBe('TIPO_DE_ARGUMENTO');
      expect(errorCode('aleatorio(1)')).toBe('CANTIDAD_DE_ARGUMENTOS');
    });
  });

  describe('texto', () => {
    test.each([
      ['mayúsculas("Ñandú")', '"ÑANDÚ"'],
      ['minúsculas("ÁRBOL")', '"árbol"'],
      ['recortar("  hola \\n")', '"hola"'],
      ['dividir("a,b,,c", ",")', '["a", "b", "", "c"]'],
      ['unir(["a", 1, verdadero], "-")', '"a-1-verdadero"'],
      ['unir([], ", ")', '""'],
      ['reemplazar("la casa la", "la", "su")', '"su casa su"'],
      ['contiene("murciélago", "cié")', 'verdadero'],
      ['contiene("hola", "x")', 'falso'],
      ['empieza_con("Codexivo", "Code")', 'verdadero'],
      ['termina_con("Codexivo", "vo")', 'verdadero'],
      ['termina_con("Codexivo", "x")', 'falso'],
      ['posición_de("banana", "na")', '2'],
      ['posicion_de("banana", "x")', '-1'],
      ['subtexto("hola", 1, 3)', '"ol"'],
      ['subtexto("hola", 0, 4)', '"hola"'],
      ['subtexto("hola", -3, -1)', '"ol"'],
      ['subtexto("hola", 2, 2)', '""'],
      ['caracteres("año")', '["a", "ñ", "o"]'],
      ['código_de("A")', '65'],
      ['codigo_de("ñ")', '241'],
      ['carácter_de(241)', '"ñ"'],
      ['caracter_de(65)', '"A"'],
      ['invertir("hola")', '"aloh"'],
    ])('%s → %s', (source, expected) => {
      expect(value(source)).toBe(expected);
    });

    test.each([
      ['mayúsculas(5)', 'TIPO_DE_ARGUMENTO'],
      ['minúsculas(nulo)', 'TIPO_DE_ARGUMENTO'],
      ['recortar([])', 'TIPO_DE_ARGUMENTO'],
      ['dividir("abc", "")', 'SEPARADOR_VACÍO'],
      ['dividir(5, ",")', 'TIPO_DE_ARGUMENTO'],
      ['unir("abc", ",")', 'TIPO_DE_ARGUMENTO'],
      ['unir(["a"], 1)', 'TIPO_DE_ARGUMENTO'],
      ['reemplazar("abc", "", "x")', 'SEPARADOR_VACÍO'],
      ['reemplazar("abc", "a", 1)', 'TIPO_DE_ARGUMENTO'],
      ['contiene(5, 1)', 'TIPO_DE_ARGUMENTO'],
      ['contiene("abc", 1)', 'TIPO_DE_ARGUMENTO'],
      ['empieza_con("abc", 1)', 'TIPO_DE_ARGUMENTO'],
      ['termina_con(1, "a")', 'TIPO_DE_ARGUMENTO'],
      ['posición_de(nulo, "a")', 'TIPO_DE_ARGUMENTO'],
      ['subtexto("hola", 0, 9)', 'ÍNDICE_FUERA_DE_RANGO'],
      ['subtexto("hola", 3, 1)', 'RANGO_INVÁLIDO'],
      ['subtexto("hola", 0.5, 1)', 'ÍNDICE_INVÁLIDO'],
      ['caracteres(5)', 'TIPO_DE_ARGUMENTO'],
      ['código_de("ab")', 'TIPO_DE_ARGUMENTO'],
      ['carácter_de(-1)', 'TIPO_DE_ARGUMENTO'],
      ['carácter_de(1.5)', 'TIPO_DE_ARGUMENTO'],
      ['invertir(5)', 'TIPO_DE_ARGUMENTO'],
    ])('%s → %s', (source, code) => {
      expect(errorCode(source)).toBe(code);
    });

    test('las pistas orientan', () => {
      expect(run('dividir("abc", "")').errors[0]!.hint).toContain('caracteres');
      expect(run('subtexto("hola", 3, 1)').errors[0]!.hint).toContain('no se incluye');
      expect(run('subtexto("hola", 0, 9)').errors[0]!.message).toContain('tiene 4 caracteres');
    });
  });

  describe('listas (paso 5)', () => {
    test.each([
      ['variable l = [1, 3]; insertar(l, 1, 2); l;', '[1, 2, 3]'],
      ['variable l = [1]; insertar(l, 1, 2); insertar(l, 0, 0); l;', '[0, 1, 2]'],
      ['variable l = [1, 2]; insertar(l, -1, 9); l;', '[1, 9, 2]'],
      ['variable l = [1, 2, 3]; [quitar_último(l), l];', '[3, [1, 2]]'],
      ['variable l = [1, 2, 3]; [quitar_primero(l), l];', '[1, [2, 3]]'],
      ['variable l = [1, 2]; vaciar(l); l;', '[]'],
      ['variable d = { "a": 1 }; vaciar(d); d;', '{}'],
      ['contiene([1, [2]], [2])', 'verdadero'],
      ['contiene([1, 2], "1")', 'falso'],
      ['posición_de(["a", "b", "b"], "b")', '1'],
      ['posición_de([], 1)', '-1'],
      ['rebanar([1, 2, 3, 4], 1, 3)', '[2, 3]'],
      ['rebanar([1, 2, 3, 4], -2, 4)', '[3, 4]'],
      ['rebanar([1, 2], 0, 0)', '[]'],
      ['variable l = [1, 2, 3]; [invertir(l), l];', '[[3, 2, 1], [1, 2, 3]]'],
      ['variable l = [3, 1, 2]; [ordenar(l), l];', '[[1, 2, 3], [3, 1, 2]]'],
      ['ordenar(["pera", "Mango", "árbol", "manzana"])', '["Mango", "manzana", "pera", "árbol"]'],
      ['ordenar([])', '[]'],
      ['ordenar([2, -1, 0.5])', '[-1, 0.5, 2]'],
      [
        'variable a = [[1]]; variable b = copiar(a); agregar(b, 2); [a, b, a[0] == b[0]];',
        '[[[1]], [[1], 2], verdadero]',
      ],
      ['variable a = { "x": 1 }; variable b = copiar(a); b.z = 2; [a, b];', '[{"x": 1}, {"x": 1, "z": 2}]'],
      ['sumar([1, 2, 3.5])', '6.5'],
      ['sumar([])', '0'],
      ['lista_de(3, 0)', '[0, 0, 0]'],
      ['lista_de(0, "x")', '[]'],
      ['matriz(2, 3, 0)', '[[0, 0, 0], [0, 0, 0]]'],
    ])('%s → %s', (source, expected) => {
      expect(value(source)).toBe(expected);
    });

    test('`lista_de` y `matriz` copian el valor en cada casilla', () => {
      expect(value('variable l = lista_de(2, []); agregar(l[0], 1); l;')).toBe('[[1], []]');
      expect(value('variable m = matriz(2, 2, 0); m[0][0] = 5; m;')).toBe('[[5, 0], [0, 0]]');
      expect(value('variable m = matriz(1, 2, { "v": 0 }); m[0][0].v = 1; m;')).toBe('[[{"v": 1}, {"v": 0}]]');
    });

    test.each([
      ['insertar([1], 5, 0)', 'ÍNDICE_FUERA_DE_RANGO'],
      ['insertar("ab", 0, "c")', 'TIPO_DE_ARGUMENTO'],
      ['quitar_último([])', 'LISTA_VACÍA'],
      ['quitar_primero([])', 'LISTA_VACÍA'],
      ['quitar_primero("a")', 'TIPO_DE_ARGUMENTO'],
      ['vaciar("abc")', 'TIPO_DE_ARGUMENTO'],
      ['rebanar([1, 2], 0, 3)', 'ÍNDICE_FUERA_DE_RANGO'],
      ['rebanar([1, 2], 2, 1)', 'RANGO_INVÁLIDO'],
      ['rebanar("ab", 0, 1)', 'TIPO_DE_ARGUMENTO'],
      ['ordenar([1, "a"])', 'TIPO_DE_ARGUMENTO'],
      ['ordenar([[1]])', 'TIPO_DE_ARGUMENTO'],
      ['copiar(5)', 'TIPO_DE_ARGUMENTO'],
      ['sumar([1, "a"])', 'TIPO_DE_ARGUMENTO'],
      ['sumar(5)', 'TIPO_DE_ARGUMENTO'],
      ['lista_de(-1, 0)', 'TIPO_DE_ARGUMENTO'],
      ['lista_de(1.5, 0)', 'TIPO_DE_ARGUMENTO'],
      ['matriz(2, "a", 0)', 'TIPO_DE_ARGUMENTO'],
      ['matriz(10000, 10000, 0)', 'TIPO_DE_ARGUMENTO'],
    ])('%s → %s', (source, code) => {
      expect(errorCode(source)).toBe(code);
    });
  });

  test('cada procedimiento nuevo registra su costo en operaciones', () => {
    expect(natives.ordenar!.cost!([{ kind: 'lista', id: 0, items: [3, 1, 2, 4] }])).toBe(8);
    expect(natives.contiene!.cost!(['hola', 'o'])).toBe(4);
    expect(natives.copiar!.cost!([{ kind: 'lista', id: 0, items: [] }])).toBe(1);
    expect(natives.matriz!.cost!([2, 3, 0])).toBe(6);
  });
});
