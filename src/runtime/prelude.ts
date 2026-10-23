import { parse } from '../syntax/parser';
import { compileProcedure } from './compiler';
import { COSTS } from './costs';
import type { Chunk } from './compiler';
import { Scope } from './values';
import type { ProcedureValue } from './values';

/**
 * Los procedimientos de la biblioteca que reciben procedimientos están escritos en Codexivo. Así, cuando
 * llaman a `f`, la llamada pasa por la máquina como cualquier otra: se puede pausar dentro de `f`, cuenta
 * para el límite de llamadas, emite sus eventos y sus operaciones se cuentan igual que siempre.
 *
 * Su propio código se compila como oculto (`Chunk.hidden`): no pausa ni emite pasos, y en lugar de contar
 * cada instrucción se cobra lo que dice `costs.ts`. Los `revisar_*` y `ordenar_natural` son nativos internos
 * que solo se ven desde aquí (`internals` en `builtins.ts`).
 */
const SOURCE = `
procedimiento mapear(lista, f) {
  revisar_lista("mapear", lista);
  revisar_procedimiento("mapear", f);
  variable resultado = [];
  para_cada elemento en lista {
    agregar(resultado, f(elemento));
  }
  regresa resultado;
}

procedimiento filtrar(lista, f) {
  revisar_lista("filtrar", lista);
  revisar_procedimiento("filtrar", f);
  variable resultado = [];
  para_cada elemento en lista {
    si (revisar_logico("filtrar", f(elemento))) {
      agregar(resultado, elemento);
    }
  }
  regresa resultado;
}

procedimiento reducir(lista, f, inicial) {
  revisar_lista("reducir", lista);
  revisar_procedimiento("reducir", f);
  variable acumulado = inicial;
  para_cada elemento en lista {
    acumulado = f(acumulado, elemento);
  }
  regresa acumulado;
}

procedimiento alguno(lista, f) {
  revisar_lista("alguno", lista);
  revisar_procedimiento("alguno", f);
  para_cada elemento en lista {
    si (revisar_logico("alguno", f(elemento))) {
      regresa verdadero;
    }
  }
  regresa falso;
}

procedimiento todos(lista, f) {
  revisar_lista("todos", lista);
  revisar_procedimiento("todos", f);
  para_cada elemento en lista {
    si (no revisar_logico("todos", f(elemento))) {
      regresa falso;
    }
  }
  regresa verdadero;
}

procedimiento buscar(lista, f) {
  revisar_lista("buscar", lista);
  revisar_procedimiento("buscar", f);
  para_cada elemento en lista {
    si (revisar_logico("buscar", f(elemento))) {
      regresa elemento;
    }
  }
  regresa nulo;
}

procedimiento ordenar(lista, va_antes) {
  revisar_lista("ordenar", lista);
  si (va_antes == nulo) {
    regresa ordenar_natural(lista);
  }
  revisar_procedimiento("ordenar", va_antes);

  // Ordenamiento por mezcla: estable, porque solo adelanta un elemento de la derecha si va antes.
  procedimiento mezclar(parte) {
    si (longitud(parte) <= 1) {
      regresa copiar(parte);
    }
    variable medio = longitud(parte) div 2;
    variable izquierda = mezclar(rebanar(parte, 0, medio));
    variable derecha = mezclar(rebanar(parte, medio, longitud(parte)));
    variable resultado = [];
    variable i = 0;
    variable j = 0;
    mientras (i < longitud(izquierda) y j < longitud(derecha)) {
      si (revisar_logico("ordenar", va_antes(derecha[j], izquierda[i]))) {
        agregar(resultado, derecha[j]);
        j++;
      } si_no {
        agregar(resultado, izquierda[i]);
        i++;
      }
    }
    mientras (i < longitud(izquierda)) {
      agregar(resultado, izquierda[i]);
      i++;
    }
    mientras (j < longitud(derecha)) {
      agregar(resultado, derecha[j]);
      j++;
    }
    regresa resultado;
  }
  regresa mezclar(lista);
}
`;

/** Parámetros que se pueden omitir (llegan como `nulo`). */
const OPTIONAL: Readonly<Record<string, number>> = { ordenar: 1 };

const compileLibrary = (): Map<string, Chunk> => {
  const { program, errors } = parse(SOURCE);
  if (errors.length > 0) throw new Error(`La biblioteca en Codexivo tiene errores: ${errors[0]!.message}`);
  const chunks = new Map<string, Chunk>();
  for (const statement of program.statements) {
    if (statement.kind !== 'FunctionDeclaration') continue;
    const chunk = compileProcedure(statement.function, true);
    const optional = OPTIONAL[statement.name.name];
    if (optional !== undefined) chunk.minParams = optional;
    chunks.set(statement.name.name, chunk);
  }
  return chunks;
};

/**
 * Los procedimientos de la biblioteca escritos en Codexivo, por nombre. Son inmutables, así que todas las
 * máquinas los comparten. Sus `id` son negativos para no mover los de los valores del programa.
 */
export const libraryProcedures: Readonly<Record<string, ProcedureValue>> = (() => {
  const scope = new Scope();
  const table: Record<string, ProcedureValue> = {};
  let id = -1;
  for (const [name, chunk] of compileLibrary()) {
    const procedure: ProcedureValue = { kind: 'procedimiento', id: id--, name, chunk, closure: scope };
    scope.variables.set(name, procedure);
    table[name] = procedure;
  }
  return table;
})();

/** Costo de llamar a un procedimiento de la biblioteca escrito en Codexivo. */
export const libraryCost = (name: string) => COSTS[name];
