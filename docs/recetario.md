# Recetario de programas Codexivo

Esta colección de programas ilustra patrones útiles del lenguaje. Cada ejemplo está listo para copiarse en el REPL o en un
archivo `.codexivo`.

## 1. Hola mundo personalizado

```codexivo
variable saludar = procedimiento(nombre) {
  regresa "Hola " + nombre + "!";
};

saludar("Codexivo");
```

Demuestra cómo declarar un procedimiento, concatenar cadenas y retornar un valor.

## 2. Clasificador por edades

```codexivo
variable clasificar = procedimiento(edad) {
  si (edad >= 18) {
    regresa "adulto";
  } pero_si (edad >= 13) {
    regresa "adolescente";
  } si_no {
    regresa "niño";
  }
};

clasificar(16);
```

Ilustra el encadenamiento `si`/`pero_si`/`si_no` y el uso de operadores relacionales.

## 3. Promedio simple

```codexivo
variable promedio = procedimiento(a, b, c) {
  variable total = a + b + c;
  regresa total / 3;
};

promedio(8, 7.5, 9);
```

Combina números enteros y decimales con operaciones aritméticas.

## 4. Valor absoluto

```codexivo
variable valorAbsoluto = procedimiento(n) {
  si (n < 0) {
    regresa -n;
  } si_no {
    regresa n;
  }
};

valorAbsoluto(-42);
```

Ejemplo de uso del operador prefijo `-` y del comportamiento truthy/falsy en condicionales.

## 5. Contador recursivo

```codexivo
variable cuentaRegresiva = procedimiento(n) {
  si (n == 0) {
    regresa "¡Despegue!";
  }

  regresa cuentaRegresiva(n - 1);
};

cuentaRegresiva(3);
```

Muestra cómo las funciones en Codexivo soportan recursión gracias a que conservan su entorno de definición.

## 6. Validación de longitud

```codexivo
variable esNombreValido = procedimiento(nombre) {
  variable tamaño = longitud(nombre);
  si (tamaño >= 3 y tamaño <= 15) {
    regresa verdadero;
  }
  regresa falso;
};

esNombreValido("Ana");
```

Ejemplo de uso del builtin `longitud` junto con operadores de comparación y booleanos.

## ⚠️ Limitaciones actuales

> **Importante:** Los bucles (`mientras`, `hacer`/`hasta_que`, `para`) todavía no tienen semántica ejecutable en la versión actual del intérprete. Por ahora, puedes simular repeticiones con recursión controlada como se muestra en el ejemplo 5.

Esta limitación es temporal y será resuelta en futuras versiones del lenguaje.


Experimenta combinando estos patrones y consulta la [especificación del lenguaje](./lenguaje.md) para profundizar en cada tema.
