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

## 7. Suma con bucle for

```codexivo
variable sumarHasta = procedimiento(n) {
  variable suma = 0;
  para (variable i = 1; i <= n; i += 1) {
    suma += i;
  }
  regresa suma;
};

sumarHasta(10); // Suma de 1 a 10 = 55
```

Demuestra el uso de bucles `para` con operadores de asignación compuesta.

## 8. Búsqueda en arreglo

```codexivo
variable buscar = procedimiento(arreglo, elemento) {
  para (variable i = 0; i < longitud(arreglo); i += 1) {
    si (arreglo[i] == elemento) {
      regresa i;
    }
  }
  regresa -1;
};

variable numeros = [10, 20, 30, 40];
buscar(numeros, 30); // Regresa 2
```

Combina bucles, acceso a arreglos, condicionales y funciones built-in.

## 9. Trabajo con funciones matemáticas

```codexivo
variable estadisticas = procedimiento(datos) {
  variable suma = 0;
  variable mayor = primero(datos);
  variable menor = primero(datos);
  
  para (variable i = 0; i < longitud(datos); i += 1) {
    suma += datos[i];
    si (datos[i] > mayor) {
      mayor = datos[i];
    }
    si (datos[i] < menor) {
      menor = datos[i];
    }
  }
  variable promedio = suma / longitud(datos);
  
  regresa [redondear(promedio), mayor, menor];
};

estadisticas([5, 2, 8, 1, 9]); // [5, 9, 1]
```

Muestra el uso de las funciones matemáticas built-in y manipulación de arreglos.

## ⚠️ Estado actual

✅ **Completo:** Todas las características principales del lenguaje están implementadas y funcionando:
- Variables y operadores aritméticos
- Procedimientos (funciones) con parámetros y valores de retorno
- Sentencias condicionales (`si`/`pero_si`/`si_no`)
- Bucles completamente funcionales (`mientras`, `hacer-hasta_que`, `para`)
- Operadores de asignación compuesta (`+=`, `-=`, `*=`, `/=`)
- Arreglos con indexación y manipulación
- Cadenas y operaciones de texto
- Biblioteca de funciones built-in

El lenguaje está listo para usar en programas de aprendizaje y práctica de algoritmos.


Experimenta combinando estos patrones y consulta la [especificación del lenguaje](./lenguaje.md) para profundizar en cada tema.
