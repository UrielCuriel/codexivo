# Uso del REPL y flujo de trabajo

El REPL (Read-Eval-Print-Loop) de Codexivo permite experimentar con el lenguaje en la terminal sin crear archivos. A medida que
escribes expresiones, el intérprete las tokeniza, parsea y ejecuta en caliente.

## Cómo iniciarlo

1. Instala dependencias con `bun install`.
2. Ejecuta `bun run repl` desde la raíz del proyecto.
3. Verás el banner de bienvenida seguido de un prompt `>>`. 【F:src/cli.ts†L1-L20】

También puedes invocar `bun run src/index.ts` para ejecutar programas completos con la misma infraestructura.

## Interacción básica

- Escribe declaraciones Codexivo y presiona Enter. El REPL guarda el historial en memoria (`scanned`) para que las variables
  declaradas sigan disponibles en líneas posteriores.
- Para salir escribe `salir();` y presiona Enter. 【F:src/repl.ts†L1-L48】
- Si el parser detecta errores, estos se muestran y no se evalúa el programa parcial. 【F:src/repl.ts†L32-L47】

### Ejemplo de sesión

```
>> variable saludo = procedimiento(nombre) { regresa "Hola " + nombre; };
>> saludo("Codexivo");
Hola Codexivo
>> salir();
Adios!
```

## Trazado y depuración

El REPL se centra en la experiencia interactiva, pero puedes habilitar el modo trazado en scripts personalizados aprovechando el
motor (`CodexivoEngine`) y el `RuntimeTracer`:

```ts
import { CodexivoEngine } from './src/engine';

const engine = new CodexivoEngine();
const { trace } = engine.run("variable x = 1;", { trace: true });
console.log(trace?.events);
```

Cada evento incluye el nodo visitado, el entorno y los cambios detectados. Esto es ideal para entender paso a paso cómo se
actualizan las variables mientras enseñas el lenguaje. 【F:src/engine.ts†L32-L83】【F:src/runtime/tracer.ts†L1-L173】

## Consejos prácticos

- Guarda tus experimentos pegando varias líneas seguidas; el REPL mantiene el estado acumulado.
- Usa el comando del sistema `Ctrl+C` si necesitas abortar una ejecución que quedó esperando entrada.
- Ejecuta `bun test` regularmente para asegurarte de que los cambios en el lenguaje no rompan la suite automatizada.

Con estas herramientas podrás iterar rápidamente mientras aprendes la sintaxis o desarrollas nuevas capacidades para Codexivo.
