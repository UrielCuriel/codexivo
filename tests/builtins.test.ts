import { describe, expect, test } from 'bun:test';
import { run } from '../src';

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
});
