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
  si (edad es_mayor_o_igual_a 18) {
    regresa "adulto";
  } pero_si (edad es_mayor_o_igual_a 13) {
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
  si (n es_menor_que 0) {
    regresa -n;
  } si_no {
    regresa n;
  }
};

valorAbsoluto(-42);
```

Ejemplo de uso del operador prefijo `-`.

## 5. Contador recursivo

```codexivo
variable cuentaRegresiva = procedimiento(n) {
  si (n es_igual_a 0) {
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
  si (tamaño es_mayor_o_igual_a 3 y tamaño es_menor_o_igual_a 15) {
    regresa verdadero;
  }
  regresa falso;
};

esNombreValido("Ana");
```

Ejemplo de uso del builtin `longitud` junto con operadores de comparación y booleanos.

## 7. Suma con un bucle que cuenta

```codexivo
procedimiento sumar_hasta(n) {
  variable suma = 0;
  para i desde 1 hasta n {
    suma = suma + i;
  }
  regresa suma;
}

sumar_hasta(10); // Suma de 1 a 10 = 55
```

Demuestra `para … desde … hasta`, que incluye los dos extremos.

## 8. Búsqueda en arreglo

```codexivo
procedimiento buscar_posición(lista, elemento) {
  para_cada i en índices(lista) {
    si (lista[i] es_igual_a elemento) {
      regresa i;
    }
  }
  regresa -1;
}

variable números = [10, 20, 30, 40];
buscar_posición(números, 30); // Regresa 2
```

Combina bucles, acceso a arreglos, condicionales y funciones built-in.

## 9. Trabajo con funciones matemáticas

```codexivo
variable estadisticas = procedimiento(datos) {
  variable suma = 0;
  variable mayor = primero(datos);
  variable menor = primero(datos);

  para_cada dato en datos {
    suma = suma + dato;
    si (dato es_mayor_que mayor) {
      mayor = dato;
    }
    si (dato es_menor_que menor) {
      menor = dato;
    }
  }
  variable promedio = suma / longitud(datos);

  regresa [redondear(promedio), mayor, menor];
};

estadisticas([5, 2, 8, 1, 9]); // [5, 9, 1]
```

Muestra el uso de las funciones matemáticas built-in y manipulación de arreglos.

Todos los ejemplos de este recetario se ejecutan con la versión actual del intérprete. Consulta [qué funciona hoy](./lenguaje.md)
y [hacia dónde va el lenguaje](./especificacion-v1.md).
