import { describe, expect, test } from 'bun:test';
import { tokenize, TokenType } from '../src';

const types = (source: string) => tokenize(source).tokens.map(token => token.type);

describe('lexer', () => {
  test('reconoce palabras reservadas, nombres y símbolos', () => {
    expect(types('variable x = 5;')).toEqual([
      TokenType.LET,
      TokenType.IDENT,
      TokenType.ASSIGN,
      TokenType.NUMBER,
      TokenType.SEMICOLON,
      TokenType.EOF,
    ]);
    expect(types('si pero_si si_no mientras hacer hasta_que para procedimiento regresa')).toEqual([
      TokenType.IF,
      TokenType.ELSEIF,
      TokenType.ELSE,
      TokenType.WHILE,
      TokenType.DO,
      TokenType.UNTIL,
      TokenType.FOR,
      TokenType.FUNCTION,
      TokenType.RETURN,
      TokenType.EOF,
    ]);
    expect(types('verdadero falso nulo y o no')).toEqual([
      TokenType.TRUE,
      TokenType.FALSE,
      TokenType.NULL,
      TokenType.AND,
      TokenType.OR,
      TokenType.NOT,
      TokenType.EOF,
    ]);
  });

  test('`hasta_que` tiene su propio token, distinto de `mientras`', () => {
    expect(types('hasta_que')[0]).toBe(TokenType.UNTIL);
    expect(types('mientras')[0]).toBe(TokenType.WHILE);
  });

  test('operadores de uno y dos caracteres', () => {
    expect(types('= == ! != < <= > >= + += - -= * *= / /=').slice(0, -1)).toEqual([
      TokenType.ASSIGN,
      TokenType.EQ,
      TokenType.BANG,
      TokenType.NEQ,
      TokenType.LT,
      TokenType.LTE,
      TokenType.GT,
      TokenType.GTE,
      TokenType.PLUS,
      TokenType.PLUS_ASSIGN,
      TokenType.MINUS,
      TokenType.MINUS_ASSIGN,
      TokenType.STAR,
      TokenType.STAR_ASSIGN,
      TokenType.SLASH,
      TokenType.SLASH_ASSIGN,
    ]);
  });

  test('acepta ñ, acentos y diéresis en los nombres', () => {
    const { tokens, errors } = tokenize('variable año_pingüino = 1; canción;');
    expect(errors).toEqual([]);
    expect(tokens[1]).toMatchObject({ type: TokenType.IDENT, lexeme: 'año_pingüino' });
    expect(tokens[5]).toMatchObject({ type: TokenType.IDENT, lexeme: 'canción' });
  });

  test('números enteros y decimales', () => {
    const values = tokenize('10 3.14 .5 0')
      .tokens.slice(0, -1)
      .map(token => token.value);
    expect(values).toEqual([10, 3.14, 0.5, 0]);
  });

  test('textos con comillas dobles o simples y secuencias de escape', () => {
    const tokens = tokenize(`"hola" 'mundo' "a\\nb" "dijo \\"sí\\""`).tokens;
    expect(tokens.slice(0, -1).map(token => token.value)).toEqual(['hola', 'mundo', 'a\nb', 'dijo "sí"']);
  });

  test('ignora comentarios de línea y de bloque', () => {
    expect(types('1 // comentario\n/* varias\nlíneas */ 2')).toEqual([
      TokenType.NUMBER,
      TokenType.NUMBER,
      TokenType.EOF,
    ]);
  });

  test('cada token conoce su línea, columna y desplazamiento', () => {
    const [first, second] = tokenize('x\n  siguiente').tokens;
    expect(first!.span).toEqual({ start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 2, offset: 1 } });
    expect(second!.span).toEqual({
      start: { line: 2, column: 3, offset: 4 },
      end: { line: 2, column: 12, offset: 13 },
    });
  });

  describe('errores', () => {
    const errorCodes = (source: string) => tokenize(source).errors.map(error => error.code);

    test('carácter desconocido, con pista cuando hay una', () => {
      const { errors } = tokenize('a && b');
      expect(errors[0]).toMatchObject({ kind: 'léxico', code: 'CARÁCTER_DESCONOCIDO' });
      expect(errors[0]!.hint).toContain('`y`');
    });

    test('texto sin cerrar', () => {
      expect(errorCodes('"hola')).toEqual(['TEXTO_SIN_CERRAR']);
      expect(errorCodes('"hola\nmundo"')).toContain('TEXTO_SIN_CERRAR');
    });

    test('comentario sin cerrar', () => {
      expect(errorCodes('/* nunca termina')).toEqual(['COMENTARIO_SIN_CERRAR']);
    });

    test('secuencia de escape desconocida', () => {
      expect(errorCodes('"\\q"')).toEqual(['ESCAPE_DESCONOCIDO']);
    });

    test('un nombre no puede empezar con un dígito', () => {
      expect(errorCodes('2x')).toEqual(['NOMBRE_EMPIEZA_CON_NÚMERO']);
    });

    test('comillas tipográficas', () => {
      expect(tokenize('“hola”').errors[0]!.hint).toContain('comillas rectas');
    });
  });

  describe('nivel principiante (paso 4)', () => {
    test('palabras reservadas nuevas', () => {
      expect(types('constante repetir veces mod div para_cada en romper continuar').slice(0, -1)).toEqual([
        TokenType.CONST,
        TokenType.REPEAT,
        TokenType.TIMES,
        TokenType.MOD,
        TokenType.DIV,
        TokenType.FOR_EACH,
        TokenType.IN,
        TokenType.BREAK,
        TokenType.CONTINUE,
      ]);
    });

    test('las comparaciones en palabras producen el mismo token que su símbolo', () => {
      expect(
        types('es_igual_a es_distinto_de es_menor_que es_mayor_que es_menor_o_igual_a es_mayor_o_igual_a').slice(0, -1),
      ).toEqual([TokenType.EQ, TokenType.NEQ, TokenType.LT, TokenType.GT, TokenType.LTE, TokenType.GTE]);
      expect(tokenize('a es_igual_a b').tokens[1]!.lexeme).toBe('es_igual_a');
    });

    test('`%`, `^`, `%=`, `++` y `--`', () => {
      expect(types('% ^ %= ++ --').slice(0, -1)).toEqual([
        TokenType.PERCENT,
        TokenType.CARET,
        TokenType.PERCENT_ASSIGN,
        TokenType.INCREMENT,
        TokenType.DECREMENT,
      ]);
    });

    test('`_` separa grupos de dígitos', () => {
      const { tokens, errors } = tokenize('1_000_000 3.141_592');
      expect(errors).toEqual([]);
      expect(tokens.slice(0, 2).map(token => token.value)).toEqual([1_000_000, 3.141592]);
      expect(tokens[0]!.lexeme).toBe('1_000_000');
    });

    test.each(['1__0', '1_', '1_.5'])('`_` mal puesto: %s', source => {
      const { errors } = tokenize(source);
      expect(errors.map(error => error.code)).toEqual(['SEPARADOR_INVÁLIDO']);
      expect(errors[0]!.hint).toContain('entre dos dígitos');
    });

    test('`_1` es un nombre, no un número', () => {
      expect(types('_1')[0]).toBe(TokenType.IDENT);
    });
  });
});
