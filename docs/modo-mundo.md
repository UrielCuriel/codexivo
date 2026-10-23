# Modo mundo

Codexivo nació de querer algo como el robot Karel. El **modo mundo** es el mismo lenguaje con procedimientos extra para
mover un robot en una cuadrícula. Este repositorio define el mundo, sus reglas y sus eventos; el sitio lo dibuja.

## El mundo

Un mundo se describe en JSON (formato versión 1):

```json
{
  "version": 1,
  "width": 5,
  "height": 1,
  "walls": [],
  "beepers": [
    { "x": 2, "y": 1, "count": 1 },
    { "x": 4, "y": 1, "count": 3 }
  ],
  "robot": { "x": 1, "y": 1, "facing": "este", "beepers": 0 }
}
```

| Campo             | Qué es                                                                                                               |
| ----------------- | -------------------------------------------------------------------------------------------------------------------- |
| `version`         | Siempre `1`                                                                                                          |
| `width`, `height` | Casillas de oeste a este y de sur a norte (de 1 a 100). La casilla suroeste es `(1, 1)`                              |
| `walls`           | Paredes: `{ "x", "y", "side" }` es la pared del lado `side` (`"norte"`, `"este"`, `"sur"`, `"oeste"`) de esa casilla |
| `beepers`         | Zumbadores por casilla: `{ "x", "y", "count" }`, con `count` un entero o `"infinito"`                                |
| `robot`           | Posición, orientación (`facing`) y zumbadores en la mochila (`beepers`, entero o `"infinito"`)                       |

Los bordes de la cuadrícula siempre son paredes. `validateWorld(json)` revisa un mundo y regresa los problemas con su
ubicación (`robot.x`, `walls[2].side`…) para mostrarlos en el editor.

## Los procedimientos

Solo existen cuando el programa corre en un mundo.

| Acción               | Qué hace                                       |
| -------------------- | ---------------------------------------------- |
| `avanzar()`          | Avanza una casilla hacia donde mira            |
| `girar_izquierda()`  | Gira 90° a la izquierda                        |
| `recoger_zumbador()` | Toma un zumbador de la casilla y lo guarda     |
| `dejar_zumbador()`   | Deja un zumbador de la mochila en la casilla   |
| `apagar()`           | Apaga el robot; después ya no puede hacer nada |

| Pregunta                                                                            | Responde `verdadero` si…               |
| ----------------------------------------------------------------------------------- | -------------------------------------- |
| `frente_libre()`, `izquierda_libre()`, `derecha_libre()`                            | No hay pared en esa dirección          |
| `hay_zumbador()`                                                                    | Hay al menos un zumbador en la casilla |
| `tengo_zumbadores()`                                                                | Hay al menos un zumbador en la mochila |
| `mirando_al_norte()`, `mirando_al_sur()`, `mirando_al_este()`, `mirando_al_oeste()` | El robot mira hacia ese lado           |

No hay `girar_derecha()`: construirlo es el primer ejercicio.

## Un ejemplo

Recoger todos los zumbadores de la fila y volver al inicio:

```codexivo
procedimiento girar_derecha() {
  repetir 3 veces {
    girar_izquierda()
  }
}

procedimiento recoger_todos() {
  mientras (hay_zumbador()) {
    recoger_zumbador()
  }
}

mientras (frente_libre()) {
  avanzar()
  recoger_todos()
}

// media vuelta y de regreso
girar_derecha()
girar_derecha()
mientras (frente_libre()) {
  avanzar()
}
apagar()
```

Al terminar, el robot está en `(1, 1)` mirando al oeste, apagado y con los 4 zumbadores en la mochila.

## Errores

Son errores de ejecución que dicen dónde está y hacia dónde mira el robot:

| Código             | Cuándo                                          |
| ------------------ | ----------------------------------------------- |
| `CHOQUE_CON_PARED` | `avanzar()` contra una pared o el borde         |
| `SIN_ZUMBADORES`   | `recoger_zumbador()` donde no hay               |
| `MOCHILA_VACÍA`    | `dejar_zumbador()` sin zumbadores en la mochila |
| `ROBOT_APAGADO`    | Cualquier acción después de `apagar()`          |

```
Error de ejecución en la línea 3, columna 1: El robot chocó con una pared. El robot está en (2, 1) mirando al este.
Pista: Pregunta antes con `frente_libre()`.
```

## Desde JavaScript

```ts
import { checkGoal, createWorld, run } from 'codexivo';

const world = createWorld(definición);
const result = run(código, { world, trace: true });

result.world; // estado final: el mismo formato del mundo, más `robot.on`
result.events?.filter(event => event.type === 'robot'); // una por acción: before, after y la casilla

checkGoal(result.world!, {
  robot: { x: 1, y: 1, on: false },
  beepers: [],
  onlyListedBeepers: true, // las casillas no listadas tienen que quedar vacías
});
// → { ok: true, differences: [] }
```

- Cada acción emite un evento `robot` con `action`, el robot `before` y `after` (posición, orientación, mochila y si
  está encendido) y, al recoger o dejar, los zumbadores que quedaron en la casilla (`cell`).
- `machine.snapshot().world` trae el estado del mundo en cualquier pausa.
- `checkGoal` compara el mundo final con un objetivo y solo revisa lo que el objetivo indica; cada diferencia trae un
  mensaje para mostrarlo en el reto.
