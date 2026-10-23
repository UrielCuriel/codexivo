import type { ErrorKind } from './errors';

/**
 * Todos los códigos de error, con una explicación larga para la página de «errores comunes» del sitio. Una
 * prueba revisa que cada código que se usa en `src/` esté aquí, y que aquí no sobre ninguno.
 */
export const ERROR_CODES: Readonly<Record<string, { kind: ErrorKind; explanation: string }>> = {
  // léxico
  CARÁCTER_DESCONOCIDO: {
    kind: 'léxico',
    explanation:
      'El código tiene un carácter que Codexivo no usa, como `&`, `|` o `@`. Suele pasar al copiar código de otro lenguaje o de un documento: las comillas tipográficas (“ ”) no son comillas de código. Para «y» y «o» se escriben las palabras `y` y `o`.',
  },
  COMENTARIO_SIN_CERRAR: {
    kind: 'léxico',
    explanation:
      'Un comentario `/*` sigue hasta encontrar `*/`. Si falta el cierre, todo lo que viene después queda dentro del comentario y no se ejecuta.',
  },
  ESCAPE_DESCONOCIDO: {
    kind: 'léxico',
    explanation:
      'Dentro de un texto, `\\` empieza una secuencia de escape. Las válidas son `\\n` (salto de línea), `\\t` (tabulador), `\\\\`, `\\"` y `\\\'`. Para escribir una diagonal invertida se escribe dos veces.',
  },
  NOMBRE_EMPIEZA_CON_NÚMERO: {
    kind: 'léxico',
    explanation:
      'Los nombres pueden llevar dígitos, pero no al principio: `x2` es un nombre y `2x` no. Si querías multiplicar, escribe el operador: `2 * x`.',
  },
  SEPARADOR_INVÁLIDO: {
    kind: 'léxico',
    explanation:
      'En los números, `_` solo sirve para separar grupos de dígitos y que se lean mejor: `1_000_000`. Tiene que ir entre dos dígitos; `1__0` o `1_` no son números.',
  },
  TEXTO_SIN_CERRAR: {
    kind: 'léxico',
    explanation:
      'Un texto empieza y termina con la misma comilla, en la misma línea. Si falta la comilla final, Codexivo no sabe dónde termina. Para un salto de línea dentro del texto usa `\\n`.',
  },

  // sintaxis
  ANIDAMIENTO_EXCESIVO: {
    kind: 'sintaxis',
    explanation:
      'La expresión tiene demasiados niveles de paréntesis o de operaciones anidadas. Guarda partes en variables intermedias: además de evitar el error, el programa se lee mejor.',
  },
  ASIGNACIÓN_INVÁLIDA: {
    kind: 'sintaxis',
    explanation:
      'A la izquierda de `=` (o de `+=`, `++`…) tiene que ir algo que pueda guardar un valor: una variable (`x = 1`), un elemento (`lista[0] = 1`) o un campo (`persona.edad = 16`). `5 = x` o `f(x) = 1` no tienen dónde guardarlo.',
  },
  BLOQUE_SIN_CERRAR: {
    kind: 'sintaxis',
    explanation:
      'Cada `{` necesita su `}`. El error señala la llave que abrió el bloque; revisa que cada `si`, `mientras` o procedimiento cierre su bloque antes de que empiece lo que sigue.',
  },
  CAMPO_ESPERADO: {
    kind: 'sintaxis',
    explanation:
      'Después de `.` va el nombre de un campo de un diccionario: `persona.edad`. Solo funciona con claves que son nombres válidos y que no son palabras reservadas; para las demás se escribe `d["clave"]`.',
  },
  CLAVE_REPETIDA: {
    kind: 'sintaxis',
    explanation:
      'Un diccionario escrito entre llaves tiene la misma clave dos veces. Solo se quedaría el último valor, así que casi siempre es un error de copiar y pegar.',
  },
  CLAVE_SIN_COMILLAS: {
    kind: 'sintaxis',
    explanation:
      'Las claves de un diccionario son textos o números, y los textos van entre comillas: `{ "nombre": "Ana" }`. Si querías usar el valor de una variable como clave, escríbela entre paréntesis: `{ (clave): 1 }`.',
  },
  COMPARACIÓN_ENCADENADA: {
    kind: 'sintaxis',
    explanation:
      '`1 < x < 5` parece natural, pero esconde dos comparaciones. En Codexivo se escriben las dos y se unen con `y`: `1 < x y x < 5`.',
  },
  CONTINUAR_FUERA_DE_BUCLE: {
    kind: 'sintaxis',
    explanation:
      '`continuar` salta a la siguiente vuelta del bucle más cercano, así que solo tiene sentido dentro de uno. Dentro de un procedimiento no afecta al bucle desde donde se llamó.',
  },
  DICCIONARIO_COMO_SENTENCIA: {
    kind: 'sintaxis',
    explanation:
      'Al inicio de una sentencia, `{` abre un bloque. Un diccionario tiene que estar en una expresión: guárdalo en una variable (`variable d = { "a": 1 };`) o pásalo a un procedimiento.',
  },
  EN_SIN_PARA_CADA: {
    kind: 'sintaxis',
    explanation: '`en` es parte de `para_cada elemento en lista { … }` y no se puede usar sola ni como nombre.',
  },
  EXPRESIÓN_ESPERADA: {
    kind: 'sintaxis',
    explanation:
      'En ese lugar iba un valor (un número, un texto, una variable, una llamada…) y apareció otra cosa. Suele faltar un operando, como en `x = * 2`, o se usó una palabra reservada como si fuera un nombre.',
  },
  EXPRESIÓN_INCOMPLETA: {
    kind: 'sintaxis',
    explanation:
      'El programa terminó a mitad de una expresión, como en `x = 1 +`. Revisa que no falte el último valor.',
  },
  FIN_DE_SENTENCIA: {
    kind: 'sintaxis',
    explanation:
      'Dos sentencias en la misma línea tienen que separarse con `;`. Si querías combinar dos valores, falta un operador entre ellos: `1 2` no significa nada, pero `1 + 2` sí.',
  },
  HASTA_QUE_SIN_HACER: {
    kind: 'sintaxis',
    explanation:
      '`hasta_que (condición)` cierra un bucle `hacer { … }` y tiene que ir justo después de su `}`. Para repetir mientras algo sea verdadero, usa `mientras`.',
  },
  INCREMENTO_EN_EXPRESIÓN: {
    kind: 'sintaxis',
    explanation:
      '`i++` e `i--` son sentencias: cambian la variable y nada más. No se pueden usar dentro de una expresión (`x = i++`) ni antes del nombre (`++i`). Escribe `i++;` en su propia línea y después usa `i`.',
  },
  LLAVE_SOBRANTE: {
    kind: 'sintaxis',
    explanation: 'Hay una `}` que no cierra ningún bloque. Suele ser una llave de más, o una que falta más arriba.',
  },
  NOMBRE_ESPERADO: {
    kind: 'sintaxis',
    explanation:
      'Después de `variable`, `constante`, `procedimiento` o `para_cada` va un nombre: letras, dígitos y `_`, sin empezar con dígito.',
  },
  NOMBRE_REPETIDO: {
    kind: 'sintaxis',
    explanation:
      'Un procedimiento con nombre existe desde el inicio de su bloque, para poder llamarlo antes de la línea donde se escribe. Por eso su nombre no se puede repetir en el mismo bloque, ni con otro procedimiento ni con una variable.',
  },
  PALABRA_DESCONOCIDA: {
    kind: 'sintaxis',
    explanation:
      'Se parece a una palabra de Codexivo, pero no lo es. Las palabras compuestas llevan guion bajo: `si_no`, `pero_si`, `hasta_que`.',
  },
  PALABRA_RESERVADA: {
    kind: 'sintaxis',
    explanation:
      'Las palabras reservadas (`si`, `mientras`, `y`, `veces`, `mod`…) tienen un significado fijo y no se pueden usar como nombres. Elige otro nombre, por ejemplo agregando una palabra: `valor_inicial`.',
  },
  PARÁMETRO_REPETIDO: {
    kind: 'sintaxis',
    explanation:
      'Dos parámetros de un procedimiento (o las dos variables de un `para_cada`) tienen el mismo nombre, así que no habría forma de distinguirlos.',
  },
  PROCEDIMIENTO_CON_NOMBRE: {
    kind: 'sintaxis',
    explanation:
      '`procedimiento nombre(…) { … }` es una sentencia y no puede ir dentro de una expresión. Como valor, el procedimiento se escribe sin nombre: `variable doble = procedimiento(x) { regresa x * 2; };`.',
  },
  RAMA_SIN_SI: {
    kind: 'sintaxis',
    explanation:
      '`pero_si` y `si_no` continúan un `si` y van justo después de la `}` de su bloque. Una sentencia en medio rompe la cadena.',
  },
  REPETIR_SIN_CANTIDAD: {
    kind: 'sintaxis',
    explanation: 'Falta cuántas veces se repite el bloque. La forma completa es `repetir 4 veces { … }`.',
  },
  ROMPER_FUERA_DE_BUCLE: {
    kind: 'sintaxis',
    explanation:
      '`romper` sale del bucle más cercano, así que solo tiene sentido dentro de uno. Para salir de un procedimiento se usa `regresa`.',
  },
  SENTENCIA_EN_EXPRESIÓN: {
    kind: 'sintaxis',
    explanation:
      'Palabras como `si`, `mientras` o `variable` empiezan una sentencia y no dan un valor, así que no pueden ir donde se espera uno, como a la derecha de `=`.',
  },
  SI_NO_SI: {
    kind: 'sintaxis',
    explanation:
      'Después de `si_no` va directamente un bloque. Para probar otra condición se usa `pero_si (condición) { … }`.',
  },
  TOKEN_ESPERADO: {
    kind: 'sintaxis',
    explanation:
      'Falta un símbolo o una palabra que la sentencia necesita, como el `(` de una condición o el `veces` de `repetir`. El mensaje dice qué se esperaba y qué se encontró.',
  },
  ÍNDICE_VACÍO: {
    kind: 'sintaxis',
    explanation: 'Entre los corchetes va la posición o la clave: `lista[0]`, `d["nombre"]`.',
  },

  // ejecución
  CANTIDAD_DE_ARGUMENTOS: {
    kind: 'ejecución',
    explanation:
      'Un procedimiento se llama con exactamente tantos valores como parámetros tiene. Si faltan o sobran, es un error: Codexivo no rellena los que faltan.',
  },
  CHOQUE_CON_PARED: {
    kind: 'ejecución',
    explanation:
      'El robot intentó avanzar hacia una pared o fuera del mundo. Antes de `avanzar()`, pregunta con `frente_libre()`.',
  },
  CLAVE_INEXISTENTE: {
    kind: 'ejecución',
    explanation:
      'Se leyó una clave que el diccionario no tiene. Pregunta antes con `tiene(d, clave)`, o revisa que la clave esté bien escrita: `"Edad"` y `"edad"` son distintas, igual que `1` y `"1"`.',
  },
  CLAVE_INVÁLIDA: {
    kind: 'ejecución',
    explanation:
      'Las claves de un diccionario son textos o números. Una lista, un lógico o `nulo` no pueden ser clave.',
  },
  COLA_VACÍA: {
    kind: 'ejecución',
    explanation:
      'Se intentó sacar o consultar el frente de una cola que no tiene nada. Revisa antes con `longitud(cola) > 0`.',
  },
  COMPARACIÓN_INVÁLIDA: {
    kind: 'ejecución',
    explanation:
      '`<`, `>`, `<=` y `>=` comparan dos números o dos textos. Comparar un número con un texto no tiene un orden claro; convierte uno de los dos con `número(…)` o `texto(…)`.',
  },
  CONDICIÓN_NO_LÓGICA: {
    kind: 'ejecución',
    explanation:
      'Las condiciones de `si`, `mientras`, `hasta_que` y `para` tienen que ser `verdadero` o `falso`. En otros lenguajes `si (x)` funciona con números; en Codexivo se dice lo que se quiere preguntar: `si (x != 0)`.',
  },
  CONSTANTE_REASIGNADA: {
    kind: 'ejecución',
    explanation:
      'Una `constante` no cambia de valor. Si necesitas cambiarlo, declárala con `variable` en lugar de `constante`.',
  },
  DICCIONARIO_MODIFICADO_AL_RECORRER: {
    kind: 'ejecución',
    explanation:
      'Se agregaron o quitaron claves de un diccionario mientras `para_cada` lo recorría. Recorre `claves(d)`, que es una lista nueva, o junta los cambios y aplícalos al terminar.',
  },
  DIVISIÓN_ENTRE_CERO: {
    kind: 'ejecución',
    explanation:
      'Dividir entre cero (con `/`, `div`, `mod` o `%`) no tiene resultado. Revisa el divisor antes de dividir.',
  },
  LISTA_MODIFICADA_AL_RECORRER: {
    kind: 'ejecución',
    explanation:
      'La lista cambió de tamaño mientras `para_cada` la recorría, así que no queda claro qué elemento sigue. Cambiar elementos está bien; para agregar o quitar, recorre una copia o junta los cambios en otra lista.',
  },
  LISTA_VACÍA: {
    kind: 'ejecución',
    explanation:
      'El procedimiento necesita al menos un elemento y la lista está vacía. Revisa antes con `longitud(lista) > 0`.',
  },
  MOCHILA_VACÍA: {
    kind: 'ejecución',
    explanation: 'El robot intentó dejar un zumbador sin tener ninguno. Pregunta antes con `tengo_zumbadores()`.',
  },
  NOMBRE_DESCONOCIDO: {
    kind: 'ejecución',
    explanation:
      'No hay ninguna variable ni procedimiento con ese nombre a la vista. Puede estar mal escrito, declararse más abajo, o haberse declarado dentro de un bloque que ya terminó.',
  },
  NOMBRE_RESERVADO_POR_BIBLIOTECA: {
    kind: 'ejecución',
    explanation:
      'Ese nombre es de la biblioteca de Codexivo y no se le puede asignar un valor. Si quieres una variable propia con ese nombre, declárala con `variable`; mientras exista, oculta al de la biblioteca.',
  },
  NO_ES_NÚMERO: {
    kind: 'ejecución',
    explanation:
      'Se esperaba un número y el texto no lo es, como `"doce"` o `"3,5"`. Los decimales se escriben con punto: `"3.5"`.',
  },
  NO_ES_PROCEDIMIENTO: {
    kind: 'ejecución',
    explanation:
      'Se intentó llamar con `( )` a algo que no es un procedimiento, como un número o una lista. Revisa que no estés usando una variable con el mismo nombre que el procedimiento.',
  },
  OPERANDO_NO_LÓGICO: {
    kind: 'ejecución',
    explanation:
      '`y`, `o` y `no` unen valores `verdadero` o `falso`. Para preguntar algo sobre un número o un texto, compáralo primero: `x > 0 y nombre != ""`.',
  },
  PARA_CADA_INVÁLIDO: {
    kind: 'ejecución',
    explanation:
      '`para_cada` recorre listas, textos y diccionarios. Para contar se recorre un rango (`para_cada i en rango(1, 10)`), y la forma con dos variables (`para_cada clave, valor en d`) es solo para diccionarios.',
  },
  PILA_VACÍA: {
    kind: 'ejecución',
    explanation:
      'Se intentó sacar o consultar el tope de una pila que no tiene nada. Revisa antes con `longitud(pila) > 0`.',
  },
  POTENCIA_INVÁLIDA: {
    kind: 'ejecución',
    explanation:
      'Un número negativo elevado a un exponente con decimales, como `(-8) ^ 0.5`, no tiene un resultado real. Con exponentes enteros sí funciona.',
  },
  RANGO_DEMASIADO_GRANDE: {
    kind: 'ejecución',
    explanation:
      'El `rango` tendría millones de números, lo que casi siempre es un error en el inicio, el final o el paso. Revísalos.',
  },
  RANGO_INVÁLIDO: {
    kind: 'ejecución',
    explanation:
      'En `subtexto` y `rebanar`, el inicio no puede estar después del fin. El fin no se incluye: `subtexto("hola", 1, 3)` es `"ol"`.',
  },
  RANGO_PASO_CERO: {
    kind: 'ejecución',
    explanation:
      'Con paso 0, `rango` nunca llegaría al final. Usa un paso positivo para contar hacia arriba o uno negativo para contar hacia abajo.',
  },
  RAÍZ_DE_NEGATIVO: {
    kind: 'ejecución',
    explanation: 'La raíz cuadrada solo existe para números de 0 en adelante.',
  },
  REPETICIONES_INVÁLIDAS: {
    kind: 'ejecución',
    explanation:
      '`repetir n veces` necesita que `n` sea un número entero, 0 o más. Con un texto, conviértelo con `número(…)`; con decimales, redondéalo.',
  },
  ROBOT_APAGADO: {
    kind: 'ejecución',
    explanation: 'Después de `apagar()` el robot ya no hace ninguna acción. `apagar()` va al final del programa.',
  },
  SEPARADOR_VACÍO: {
    kind: 'ejecución',
    explanation:
      '`dividir` y `reemplazar` necesitan un texto que buscar que no esté vacío. Para separar letra por letra, usa `caracteres(t)`.',
  },
  SIN_ENTRADA: {
    kind: 'ejecución',
    explanation:
      '`leer_número()` no encontró más datos de entrada. Revisa cuántos datos espera el programa y cuántos se le dieron.',
  },
  SIN_ZUMBADORES: {
    kind: 'ejecución',
    explanation: 'El robot intentó recoger un zumbador donde no hay. Pregunta antes con `hay_zumbador()`.',
  },
  TEXTO_INMUTABLE: {
    kind: 'ejecución',
    explanation:
      'Los textos no se cambian letra por letra: `t[0] = "H"` es un error. Se construye un texto nuevo, por ejemplo uniendo partes con `+` o con `reemplazar`.',
  },
  TIPOS_MEZCLADOS: {
    kind: 'ejecución',
    explanation:
      '`+` suma dos números o une dos textos, pero no mezcla: `"Total: " + 5` es un error. Convierte el número con `texto(5)`, o imprime los dos por separado: `imprimir("Total:", 5)`.',
  },
  TIPO_DE_ARGUMENTO: {
    kind: 'ejecución',
    explanation:
      'Un procedimiento de la biblioteca recibió un valor de un tipo que no acepta, como un texto donde esperaba un número. El mensaje dice qué esperaba y qué recibió.',
  },
  TIPO_INVÁLIDO: {
    kind: 'ejecución',
    explanation:
      'El operador no funciona con esos tipos, como `-` entre dos textos o `no` con un número. Revisa qué valor tiene cada lado.',
  },
  VARIABLE_NO_DECLARADA: {
    kind: 'ejecución',
    explanation:
      'Se le asignó un valor a una variable que no existe. La primera vez se declara con `variable x = …`; después se cambia con `x = …`.',
  },
  VARIABLE_REPETIDA: {
    kind: 'ejecución',
    explanation:
      'La variable ya existe en este bloque. Para cambiar su valor se escribe `x = …`, sin `variable`. Un bloque interno sí puede declarar otra con el mismo nombre.',
  },
  ÍNDICE_FUERA_DE_RANGO: {
    kind: 'ejecución',
    explanation:
      'Las posiciones van de 0 a `longitud - 1` (o de -1 a `-longitud` desde el final). Un error clásico es usar `longitud(lista)` como índice: el último es `longitud(lista) - 1`.',
  },
  ÍNDICE_INVÁLIDO: {
    kind: 'ejecución',
    explanation:
      'La posición de una lista o texto tiene que ser un número entero. Las claves de texto son para diccionarios.',
  },
  ÍNDICE_NO_SOPORTADO: {
    kind: 'ejecución',
    explanation:
      '`[ ]` funciona con listas, textos y diccionarios, y `.campo` solo con diccionarios. Revisa qué valor tiene la variable.',
  },

  // límite
  DEMASIADAS_LLAMADAS: {
    kind: 'límite',
    explanation:
      'Hay demasiadas llamadas anidadas, casi siempre por una recursión sin caso base: el procedimiento se llama a sí mismo sin una condición que lo detenga.',
  },
  DEMASIADAS_OPERACIONES: {
    kind: 'límite',
    explanation:
      'El programa hizo más operaciones de las permitidas. Casi siempre es un bucle cuya condición nunca cambia; revisa que algo dentro del bucle lo acerque al final.',
  },
  DEMASIADA_SALIDA: {
    kind: 'límite',
    explanation:
      'El programa imprimió demasiado texto, casi siempre por un `imprimir` dentro de un bucle que no termina.',
  },
};
