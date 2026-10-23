import { CodexivoError } from '../errors';
import type { ErrorInfo } from '../errors';
import type * as ast from '../syntax/ast';
import type { Span } from '../syntax/token';
import { constants as libraryConstants, natives as defaultNatives } from './builtins';
import type { Chunk, DecisionLabel, Instruction } from './compiler';
import { describeType, equals, isCallable, isList, repr, Scope, typeOf, WAIT_FOR_INPUT } from './values';
import type { ListValue, NativeContext, NativeValue, ProcedureValue, Value } from './values';
import { suggestName } from './suggest';

export type MachineStatus = 'lista' | 'pausada' | 'esperando_entrada' | 'terminada' | 'error';

export interface MachineOptions {
  /** Máximo de operaciones antes de detener el programa. Por defecto 10 000 000. */
  maxOperations?: number;
  /** Máximo de llamadas anidadas. Por defecto 10 000. */
  maxCallDepth?: number;
  /** Máximo de caracteres de salida. Por defecto 1 000 000. */
  maxOutput?: number;
  /** Líneas de entrada para `leer()`. */
  input?: string | string[];
  /** Si es `true`, `leer()` sin entrada pausa la máquina en lugar de regresar `nulo`. */
  interactiveInput?: boolean;
  /** Procedimientos nativos adicionales (por ejemplo, los del modo mundo). */
  natives?: Record<string, NativeValue>;
  /** Líneas donde `run()` se detiene antes de ejecutar la sentencia. */
  breakpoints?: number[];
  /** Alcance global compartido entre ejecuciones (lo usa el REPL). */
  globals?: Scope;
  /** Permite volver a declarar una variable existente (útil en el REPL). */
  allowRedeclare?: boolean;
  /** Recibe cada evento de la ejecución. Activarlo hace la ejecución más lenta. */
  onEvent?: (event: MachineEvent) => void;
}

// ── eventos y fotografías ────────────────────────────────────────────────────

export type SerializedValue =
  | { type: 'número'; value: number; repr: string }
  | { type: 'texto'; value: string; repr: string }
  | { type: 'lógico'; value: boolean; repr: string }
  | { type: 'nulo'; value: null; repr: string }
  | { type: 'lista'; ref: number; length: number; repr: string }
  | { type: 'procedimiento'; name?: string; repr: string };

export const serialize = (value: Value): SerializedValue => {
  const text = repr(value);
  if (value === null) return { type: 'nulo', value: null, repr: text };
  switch (typeof value) {
    case 'number':
      return { type: 'número', value, repr: text };
    case 'string':
      return { type: 'texto', value, repr: text };
    case 'boolean':
      return { type: 'lógico', value, repr: text };
  }
  if (value.kind === 'lista') return { type: 'lista', ref: value.id, length: value.items.length, repr: text };
  return { type: 'procedimiento', name: value.name, repr: text };
};

interface EventBase {
  /** Operaciones ejecutadas hasta este evento. */
  operations: number;
  /** Profundidad de llamadas: 1 en el programa principal. */
  depth: number;
}

export type MachineEvent = EventBase &
  (
    | { type: 'paso'; nodeId: number; nodeKind: ast.Statement['kind']; span: Span }
    | { type: 'declara'; name: string; constant: boolean; value: SerializedValue; nodeId: number; span: Span }
    | { type: 'asigna'; name: string; before: SerializedValue; after: SerializedValue; nodeId: number; span: Span }
    | { type: 'decide'; label: DecisionLabel; value: boolean; nodeId: number; ownerId: number; span: Span }
    | {
        type: 'opera';
        operator: string;
        operands: SerializedValue[];
        result: SerializedValue;
        nodeId: number;
        span: Span;
      }
    | { type: 'llama'; name: string; args: SerializedValue[]; nodeId: number; span: Span }
    | { type: 'regresa'; name: string; value: SerializedValue }
    | { type: 'imprime'; text: string }
    | { type: 'lee'; text: string | null }
    | { type: 'error'; error: ErrorInfo }
    | { type: 'fin'; result: SerializedValue }
  );

export interface FrameSnapshot {
  name: string;
  callSpan?: Span;
  /** Alcances del procedimiento, del más externo al más interno. */
  scopes: Array<Record<string, SerializedValue>>;
}

export interface Snapshot {
  status: MachineStatus;
  operations: number;
  /** Nodo donde está detenida la máquina. */
  nodeId?: number;
  span?: Span;
  /** Llamadas activas, del programa principal a la más reciente. */
  frames: FrameSnapshot[];
  /** Contenido de las listas que aparecen en `frames`, por `ref`. */
  heap: Record<number, SerializedValue[]>;
  output: string;
}

// ── máquina ──────────────────────────────────────────────────────────────────

interface Frame {
  chunk: Chunk;
  pc: number;
  scope: Scope;
  /** Primer alcance del marco; el que contiene a los parámetros. */
  root: Scope;
  /** Posición en la pila de valores donde empieza este marco (el procedimiento llamado está justo antes). */
  stackBase: number;
  name: string;
  callNode?: ast.Call;
}

const DEFAULTS = {
  maxOperations: 10_000_000,
  maxCallDepth: 10_000,
  maxOutput: 1_000_000,
};

const NO_COUNT = new Set<Instruction['op']>(['step', 'enterScope', 'exitScope', 'jump', 'repeatStart', 'halt']);

/**
 * Ejecuta un programa compilado. Tiene su propia pila de llamadas, así que la recursión no depende
 * de la pila de JavaScript, y se puede pausar en cualquier sentencia o decisión.
 */
export class Machine {
  private readonly frames: Frame[] = [];
  private readonly stack: Value[] = [];
  private readonly natives: Record<string, NativeValue>;
  private readonly inputQueue: string[];
  private readonly breakpoints: Set<number>;
  private readonly limits: typeof DEFAULTS;
  private readonly onEvent?: (event: MachineEvent) => void;
  private readonly outputParts: string[] = [];
  private outputLength = 0;
  private nextId = 1;
  private lastValue: Value = null;
  private inputClosed = false;
  private currentNode?: ast.Node;

  status: MachineStatus = 'lista';
  operations = 0;
  result: Value = null;
  error?: CodexivoError;

  constructor(
    program: Chunk,
    private readonly options: MachineOptions = {},
  ) {
    this.natives = { ...defaultNatives, ...options.natives };
    this.limits = {
      maxOperations: options.maxOperations ?? DEFAULTS.maxOperations,
      maxCallDepth: options.maxCallDepth ?? DEFAULTS.maxCallDepth,
      maxOutput: options.maxOutput ?? DEFAULTS.maxOutput,
    };
    this.inputQueue = typeof options.input === 'string' ? splitLines(options.input) : [...(options.input ?? [])];
    this.breakpoints = new Set(options.breakpoints ?? []);
    this.onEvent = options.onEvent;
    const globals = options.globals ?? new Scope();
    this.frames.push({ chunk: program, pc: 0, scope: globals, root: globals, stackBase: 0, name: 'programa' });
  }

  /** Todo lo que el programa ha impreso. */
  get output(): string {
    return this.outputParts.join('');
  }

  get done(): boolean {
    return this.status === 'terminada' || this.status === 'error';
  }

  /** Ejecuta hasta terminar, fallar, esperar entrada, llegar a un punto de interrupción o agotar `budget` operaciones. */
  run(budget = Infinity): MachineStatus {
    return this.execute('run', budget);
  }

  /** Ejecuta hasta la siguiente sentencia o decisión. */
  step(): MachineStatus {
    return this.execute('step', Infinity);
  }

  /** Entrega una línea a un `leer()` que está esperando. */
  provideInput(line: string): void {
    this.inputQueue.push(...splitLines(line));
    if (this.status === 'esperando_entrada') this.status = 'pausada';
  }

  /** Indica que no habrá más entrada: desde ahora `leer()` regresa `nulo` en lugar de esperar. */
  closeInput(): void {
    this.inputClosed = true;
    if (this.status === 'esperando_entrada') this.status = 'pausada';
  }

  snapshot(): Snapshot {
    const heap: Record<number, SerializedValue[]> = {};
    const collect = (value: Value) => {
      if (!isList(value) || heap[value.id]) return;
      heap[value.id] = value.items.map(serialize);
      value.items.forEach(collect);
    };
    const frames = this.frames.map(frame => {
      const scopes: Array<Record<string, SerializedValue>> = [];
      let scope: Scope | undefined = frame.scope;
      while (scope) {
        const variables: Record<string, SerializedValue> = {};
        for (const [name, value] of scope.variables) {
          variables[name] = serialize(value);
          collect(value);
        }
        scopes.unshift(variables);
        if (scope === frame.root) break;
        scope = scope.parent;
      }
      return { name: frame.name, callSpan: frame.callNode?.span, scopes };
    });
    return {
      status: this.status,
      operations: this.operations,
      nodeId: this.currentNode?.id,
      span: this.currentNode?.span,
      frames,
      heap,
      output: this.output,
    };
  }

  // ── ciclo principal ────────────────────────────────────────────────────────

  private execute(mode: 'run' | 'step', budget: number): MachineStatus {
    if (this.done || this.status === 'esperando_entrada') return this.status;
    const stopAt = this.operations + budget;
    let executed = 0;

    try {
      while (true) {
        const frame = this.frames[this.frames.length - 1]!;
        const instruction = frame.chunk.code[frame.pc]!;

        if (!NO_COUNT.has(instruction.op)) {
          if (this.operations >= this.limits.maxOperations) {
            throw this.limitError(
              'DEMASIADAS_OPERACIONES',
              `El programa superó el límite de ${formatCount(this.limits.maxOperations)} operaciones.`,
              '¿Hay un bucle que nunca termina? Revisa que su condición cambie en algún momento.',
            );
          }
          if (this.operations >= stopAt) {
            this.status = 'pausada';
            return this.status;
          }
        }

        // Los puntos de interrupción detienen `run()` antes de la sentencia.
        if (
          instruction.op === 'step' &&
          mode === 'run' &&
          executed > 0 &&
          this.breakpoints.has(instruction.node.span.start.line)
        ) {
          this.status = 'pausada';
          return this.status;
        }

        const pause = this.exec(frame, instruction);
        executed += 1;
        // `exec` puede cambiar el estado.
        const status = this.status as MachineStatus;
        if (status === 'esperando_entrada' || status === 'terminada') return status;
        if (mode === 'step' && pause) {
          this.status = 'pausada';
          return this.status;
        }
      }
    } catch (error) {
      if (!(error instanceof CodexivoError)) throw error;
      this.error = error;
      this.status = 'error';
      this.emit({ type: 'error', error: error.toJSON() });
      return this.status;
    }
  }

  /** Ejecuta una instrucción. Regresa `true` si es un punto de pausa para `step()`. */
  private exec(frame: Frame, instruction: Instruction): boolean {
    frame.pc += 1;
    if (!NO_COUNT.has(instruction.op)) this.operations += 1;

    switch (instruction.op) {
      case 'step':
        this.currentNode = instruction.node;
        this.emit({
          type: 'paso',
          nodeId: instruction.node.id,
          nodeKind: instruction.node.kind,
          span: instruction.node.span,
        });
        return true;

      case 'const':
        this.stack.push(instruction.value);
        return false;

      case 'list': {
        const items = this.stack.splice(this.stack.length - instruction.count, instruction.count);
        this.stack.push(this.newList(items));
        return false;
      }

      case 'load': {
        const scope = frame.scope.lookup(instruction.name);
        if (scope) {
          this.stack.push(scope.variables.get(instruction.name)!);
          return false;
        }
        const native = this.natives[instruction.name] ?? libraryConstants[instruction.name];
        if (native !== undefined && !instruction.forUpdate) {
          this.stack.push(native);
          return false;
        }
        if (instruction.forUpdate) throw this.undeclaredAssignment(instruction.name, instruction.node);
        throw this.unknownName(frame, instruction.name, instruction.node);
      }

      case 'declare': {
        const value = this.stack.pop()!;
        if (frame.scope.variables.has(instruction.name) && !this.options.allowRedeclare) {
          throw this.runtimeError(
            'VARIABLE_REPETIDA',
            `La variable \`${instruction.name}\` ya existe en este bloque.`,
            instruction.node.name,
            `Para cambiar su valor escribe \`${instruction.name} = …\`, sin \`variable\`.`,
          );
        }
        frame.scope.variables.set(instruction.name, value);
        if (instruction.constant) frame.scope.constants.add(instruction.name);
        else frame.scope.constants.delete(instruction.name);
        this.emit({
          type: 'declara',
          name: instruction.name,
          constant: instruction.constant,
          value: serialize(value),
          nodeId: instruction.node.id,
          span: instruction.node.span,
        });
        return false;
      }

      case 'store': {
        const value = this.stack.pop()!;
        const scope = frame.scope.lookup(instruction.name);
        if (!scope) throw this.undeclaredAssignment(instruction.name, instruction.node.target);
        if (scope.constants.has(instruction.name)) throw this.constantReassignment(instruction.name, instruction.node);
        const before = scope.variables.get(instruction.name)!;
        scope.variables.set(instruction.name, value);
        if (this.onEvent) {
          this.emit({
            type: 'asigna',
            name: instruction.name,
            before: serialize(before),
            after: serialize(value),
            nodeId: instruction.node.id,
            span: instruction.node.span,
          });
        }
        return false;
      }

      case 'result': {
        const value = this.stack.pop()!;
        if (this.frames.length === 1) this.lastValue = value;
        return false;
      }

      case 'unary': {
        const operand = this.stack.pop()!;
        const result = this.unary(instruction.operator, operand, instruction.node);
        this.stack.push(result);
        if (this.onEvent) this.emitOperation(instruction.operator, [operand], result, instruction.node);
        return false;
      }

      case 'binary': {
        const right = this.stack.pop()!;
        const left = this.stack.pop()!;
        const result = this.binary(instruction.operator, left, right, instruction.node);
        this.stack.push(result);
        if (this.onEvent) this.emitOperation(instruction.operator, [left, right], result, instruction.node);
        return false;
      }

      case 'index': {
        const index = this.stack.pop()!;
        const object = this.stack.pop()!;
        this.stack.push(this.index(object, index, instruction.node));
        return false;
      }

      case 'closure': {
        const procedure: ProcedureValue = {
          kind: 'procedimiento',
          id: this.nextId++,
          name: instruction.node.name,
          chunk: instruction.chunk,
          closure: frame.scope,
        };
        this.stack.push(procedure);
        return false;
      }

      case 'call':
        return this.call(frame, instruction.argc, instruction.node);

      case 'return': {
        const value = instruction.hasValue ? this.stack.pop()! : null;
        if (this.frames.length === 1) {
          this.finish(value);
          return true;
        }
        this.emit({ type: 'regresa', name: frame.name, value: serialize(value) });
        this.frames.pop();
        this.stack.length = frame.stackBase - 1;
        this.stack.push(value);
        return false;
      }

      case 'jump':
        frame.pc = instruction.target;
        return false;

      case 'branch': {
        const condition = this.stack.pop()!;
        if (typeof condition !== 'boolean')
          throw this.nonBooleanCondition(instruction.label, condition, instruction.node);
        this.currentNode = instruction.node;
        this.emit({
          type: 'decide',
          label: instruction.label,
          value: condition,
          nodeId: instruction.node.id,
          ownerId: instruction.owner.id,
          span: instruction.node.span,
        });
        if (condition === instruction.jumpWhen) frame.pc = instruction.target;
        return true;
      }

      case 'repeatStart': {
        const count = this.stack[this.stack.length - 1]!;
        if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
          throw this.invalidRepeatCount(count, instruction.node);
        }
        return false;
      }

      case 'repeatNext': {
        const remaining = this.stack[this.stack.length - 1] as number;
        const again = remaining > 0;
        if (again) this.stack[this.stack.length - 1] = remaining - 1;
        else this.stack.pop();
        this.currentNode = instruction.node;
        this.emit({
          type: 'decide',
          label: 'repetir',
          value: again,
          nodeId: instruction.node.id,
          ownerId: instruction.owner.id,
          span: instruction.node.span,
        });
        if (!again) frame.pc = instruction.target;
        return true;
      }

      case 'shortCircuit': {
        const left = this.stack[this.stack.length - 1]!;
        if (typeof left !== 'boolean') throw this.nonBooleanLogical(instruction.node, left, instruction.node.left);
        const decided = instruction.node.operator === 'y' ? left === false : left === true;
        if (decided) {
          frame.pc = instruction.target;
          if (this.onEvent) this.emitOperation(instruction.node.operator, [left], left, instruction.node);
        } else {
          this.stack.pop();
        }
        return false;
      }

      case 'checkLogical': {
        const right = this.stack[this.stack.length - 1]!;
        if (typeof right !== 'boolean') throw this.nonBooleanLogical(instruction.node, right, instruction.node.right);
        if (this.onEvent) {
          const left = instruction.node.operator === 'y';
          this.emitOperation(instruction.node.operator, [left, right], right, instruction.node);
        }
        return false;
      }

      case 'enterScope':
        frame.scope = new Scope(frame.scope);
        return false;

      case 'exitScope':
        frame.scope = frame.scope.parent ?? frame.scope;
        return false;

      case 'halt':
        this.finish(this.lastValue);
        return true;
    }
  }

  private finish(value: Value): void {
    this.result = value;
    this.status = 'terminada';
    this.emit({ type: 'fin', result: serialize(value) });
  }

  // ── llamadas ───────────────────────────────────────────────────────────────

  private call(frame: Frame, argc: number, node: ast.Call): boolean {
    const calleeIndex = this.stack.length - argc - 1;
    const callee = this.stack[calleeIndex]!;
    const name =
      callee !== null && typeof callee === 'object' && 'name' in callee && callee.name
        ? callee.name
        : describeCallee(node);

    if (!isCallable(callee)) {
      throw this.runtimeError(
        'NO_ES_PROCEDIMIENTO',
        `\`${describeCallee(node)}\` no es un procedimiento, es ${describeType(typeOf(callee))}.`,
        node.callee,
      );
    }

    const args = this.stack.slice(calleeIndex + 1);
    const expected = callee.kind === 'nativo' ? callee.arity : callee.chunk.params.length;
    checkArity(expected, argc, name, (message, hint) =>
      this.runtimeError('CANTIDAD_DE_ARGUMENTOS', message, node, hint),
    );

    if (callee.kind === 'nativo') {
      const result = callee.call(args, this.nativeContext(node));
      if (result === WAIT_FOR_INPUT) {
        // Repetimos la llamada cuando llegue la entrada.
        frame.pc -= 1;
        this.operations -= 1;
        this.status = 'esperando_entrada';
        return true;
      }
      this.stack.length = calleeIndex;
      this.stack.push(result);
      return false;
    }

    // El primer marco es el programa principal, no una llamada.
    if (this.frames.length - 1 >= this.limits.maxCallDepth) {
      throw this.limitError(
        'DEMASIADAS_LLAMADAS',
        `Hay más de ${formatCount(this.limits.maxCallDepth)} llamadas anidadas.`,
        'Si es recursión, revisa que exista un caso base que deje de llamar al procedimiento.',
        node,
      );
    }

    const scope = new Scope(callee.closure);
    callee.chunk.params.forEach((param, index) => scope.variables.set(param, args[index]!));
    this.emit({ type: 'llama', name, args: args.map(serialize), nodeId: node.id, span: node.span });
    this.frames.push({
      chunk: callee.chunk,
      pc: 0,
      scope,
      root: scope,
      stackBase: calleeIndex + 1,
      name,
      callNode: node,
    });
    return false;
  }

  private nativeContext(node: ast.Call): NativeContext {
    return {
      write: text => {
        this.outputLength += text.length;
        if (this.outputLength > this.limits.maxOutput) {
          throw this.limitError(
            'DEMASIADA_SALIDA',
            `El programa imprimió más de ${formatCount(this.limits.maxOutput)} caracteres.`,
            '¿Hay un `imprimir` dentro de un bucle que nunca termina?',
            node,
          );
        }
        this.outputParts.push(text);
        this.emit({ type: 'imprime', text });
      },
      readLine: () => {
        if (this.inputQueue.length > 0) {
          const line = this.inputQueue.shift()!;
          this.emit({ type: 'lee', text: line });
          return line;
        }
        if (this.options.interactiveInput && !this.inputClosed) return WAIT_FOR_INPUT;
        this.emit({ type: 'lee', text: null });
        return null;
      },
      newList: items => this.newList(items),
      fail: (code, message, hint) => this.runtimeError(code, message, node, hint),
    };
  }

  private newList(items: Value[]): ListValue {
    return { kind: 'lista', id: this.nextId++, items };
  }

  // ── operadores ─────────────────────────────────────────────────────────────

  private unary(operator: ast.UnaryOperator, operand: Value, node: ast.Unary): Value {
    if (operator === '-') {
      if (typeof operand !== 'number') {
        throw this.runtimeError(
          'TIPO_INVÁLIDO',
          `El signo \`-\` solo funciona con números, no con ${describeType(typeOf(operand))}.`,
          node,
        );
      }
      return -operand;
    }
    if (typeof operand !== 'boolean') {
      throw this.runtimeError(
        'TIPO_INVÁLIDO',
        `\`no\` solo funciona con \`verdadero\` o \`falso\`, pero recibió ${repr(operand)}.`,
        node.operand,
        conditionHint(operand),
      );
    }
    return !operand;
  }

  private binary(
    operator: ast.BinaryOperator,
    left: Value,
    right: Value,
    node: ast.Binary | ast.Assignment | ast.Increment,
  ): Value {
    switch (operator) {
      case '==':
        return equals(left, right);
      case '!=':
        return !equals(left, right);
      case '+':
        if (typeof left === 'number' && typeof right === 'number') return left + right;
        if (typeof left === 'string' && typeof right === 'string') return left + right;
        if (typeof left === 'string' || typeof right === 'string') {
          const other = typeof left === 'string' ? right : left;
          throw this.runtimeError(
            'TIPOS_MEZCLADOS',
            `\`+\` no puede unir un texto con ${describeType(typeOf(other))}.`,
            node,
            `Convierte el valor con \`texto(…)\`, o imprime los dos por separado: \`imprimir("Total:", ${repr(other)})\`.`,
          );
        }
        throw this.operandError(operator, left, right, node);
      case '-':
      case '*':
      case '/':
      case 'div':
      case 'mod':
      case '^': {
        if (typeof left !== 'number' || typeof right !== 'number') throw this.operandError(operator, left, right, node);
        if (operator === '-') return left - right;
        if (operator === '*') return left * right;
        if (operator === '^') {
          const result = left ** right;
          if (Number.isNaN(result)) {
            throw this.runtimeError(
              'POTENCIA_INVÁLIDA',
              `\`${left < 0 ? `(${repr(left)})` : repr(left)} ^ ${repr(right)}\` no tiene un resultado real.`,
              node,
              'Un número negativo solo se puede elevar a un exponente entero.',
            );
          }
          return result;
        }
        if (right === 0) {
          const divisor = node.kind === 'Binary' ? node.right : node.kind === 'Assignment' ? node.value : node;
          throw this.runtimeError(
            'DIVISIÓN_ENTRE_CERO',
            'No se puede dividir entre cero.',
            divisor,
            'Revisa que el divisor no valga 0 antes de dividir.',
          );
        }
        if (operator === '/') return left / right;
        // `div` y `mod` dividen hacia abajo, así `a == (a div b) * b + (a mod b)` y `-7 mod 3 == 2`.
        const quotient = Math.floor(left / right);
        return operator === 'div' ? quotient : left - right * quotient;
      }
      case '<':
      case '>':
      case '<=':
      case '>=': {
        const comparable =
          (typeof left === 'number' && typeof right === 'number') ||
          (typeof left === 'string' && typeof right === 'string');
        if (!comparable) {
          throw this.runtimeError(
            'COMPARACIÓN_INVÁLIDA',
            `No se puede comparar ${describeType(typeOf(left))} con ${describeType(typeOf(right))} usando \`${operator}\`.`,
            node,
            '`<`, `>`, `<=` y `>=` comparan dos números o dos textos.',
          );
        }
        const a = left as number | string;
        const b = right as number | string;
        if (operator === '<') return a < b;
        if (operator === '>') return a > b;
        if (operator === '<=') return a <= b;
        return a >= b;
      }
    }
  }

  private index(object: Value, index: Value, node: ast.Index): Value {
    if (!isList(object) && typeof object !== 'string') {
      throw this.runtimeError(
        'ÍNDICE_NO_SOPORTADO',
        `Solo se puede usar \`[ ]\` con listas y textos, no con ${describeType(typeOf(object))}.`,
        node.object,
      );
    }
    if (typeof index !== 'number' || !Number.isInteger(index)) {
      throw this.runtimeError(
        'ÍNDICE_INVÁLIDO',
        `El índice tiene que ser un número entero, pero es ${repr(index)}.`,
        node.index,
        typeof index === 'number' ? 'Redondea el índice con `redondear(…)`.' : undefined,
      );
    }
    const length = isList(object) ? object.items.length : object.length;
    const position = index < 0 ? length + index : index;
    if (position < 0 || position >= length) {
      const what = isList(object) ? 'la lista' : 'el texto';
      const unit = isList(object) ? 'elemento' : 'carácter';
      throw this.runtimeError(
        'ÍNDICE_FUERA_DE_RANGO',
        `El índice ${index} está fuera de ${what}, que tiene ${length} ${length === 1 ? unit : unit === 'carácter' ? 'caracteres' : 'elementos'}.`,
        node.index,
        length === 0
          ? `${what[0]!.toUpperCase()}${what.slice(1)} está vacía.`
          : `Los índices válidos van de 0 a ${length - 1} (o de -1 a -${length} desde el final).`,
      );
    }
    return isList(object) ? object.items[position]! : object[position]!;
  }

  // ── errores ────────────────────────────────────────────────────────────────

  private callStack(): string[] {
    return this.frames.map(frame => frame.name);
  }

  private runtimeError(code: string, message: string, node: { span: Span }, hint?: string): CodexivoError {
    return new CodexivoError({ kind: 'ejecución', code, message, hint, span: node.span, callStack: this.callStack() });
  }

  private limitError(code: string, message: string, hint: string, node?: { span: Span }): CodexivoError {
    return new CodexivoError({
      kind: 'límite',
      code,
      message,
      hint,
      span: node?.span ?? this.currentNode?.span,
      callStack: this.callStack(),
    });
  }

  private operandError(operator: string, left: Value, right: Value, node: { span: Span }): CodexivoError {
    return this.runtimeError(
      'TIPO_INVÁLIDO',
      `\`${operator}\` no funciona entre ${describeType(typeOf(left))} y ${describeType(typeOf(right))}.`,
      node,
    );
  }

  private unknownName(frame: Frame, name: string, node: ast.Identifier): CodexivoError {
    const visible: string[] = [...Object.keys(this.natives), ...Object.keys(libraryConstants)];
    for (let scope: Scope | undefined = frame.scope; scope; scope = scope.parent)
      visible.push(...scope.variables.keys());
    const suggestion = suggestName(name, visible);
    return this.runtimeError(
      'NOMBRE_DESCONOCIDO',
      `No existe nada llamado \`${name}\`.`,
      node,
      suggestion
        ? `¿Quisiste decir \`${suggestion}\`?`
        : `Si es una variable nueva, declárala con \`variable ${name} = …\`.`,
    );
  }

  private constantReassignment(name: string, node: ast.Assignment | ast.Increment): CodexivoError {
    return this.runtimeError(
      'CONSTANTE_REASIGNADA',
      `\`${name}\` es una constante; su valor no puede cambiar.`,
      node,
      `Si necesitas cambiarlo, declárala con \`variable ${name} = …\` en lugar de \`constante\`.`,
    );
  }

  private invalidRepeatCount(count: Value, node: ast.Expression): CodexivoError {
    if (typeof count !== 'number') {
      return this.runtimeError(
        'REPETICIONES_INVÁLIDAS',
        `\`repetir\` necesita un número de veces, pero recibió ${describeType(typeOf(count))} (${repr(count)}).`,
        node,
        typeof count === 'string' ? 'Convierte el texto con `número(…)`.' : undefined,
      );
    }
    return this.runtimeError(
      'REPETICIONES_INVÁLIDAS',
      `\`repetir\` necesita un número entero de veces, 0 o más, pero recibió ${repr(count)}.`,
      node,
      count < 0 ? 'Revisa que la cantidad no sea negativa.' : 'Redondea la cantidad con `redondear(…)`.',
    );
  }

  private undeclaredAssignment(name: string, node: ast.Identifier): CodexivoError {
    if (Object.hasOwn(libraryConstants, name)) {
      return this.runtimeError(
        'NOMBRE_RESERVADO_POR_BIBLIOTECA',
        `\`${name}\` es una constante de Codexivo; no se le puede asignar un valor.`,
        node,
        `Si quieres tu propia variable con ese nombre, declárala: \`variable ${name} = …\`.`,
      );
    }
    if (this.natives[name]) {
      return this.runtimeError(
        'NOMBRE_RESERVADO_POR_BIBLIOTECA',
        `\`${name}\` es un procedimiento de Codexivo; no se le puede asignar un valor.`,
        node,
        `Si quieres tu propia variable con ese nombre, declárala: \`variable ${name} = …\`.`,
      );
    }
    return this.runtimeError(
      'VARIABLE_NO_DECLARADA',
      `La variable \`${name}\` no existe.`,
      node,
      `¿Olvidaste declararla? Escribe \`variable ${name} = …\` la primera vez.`,
    );
  }

  private nonBooleanCondition(label: DecisionLabel, value: Value, node: ast.Expression): CodexivoError {
    return this.runtimeError(
      'CONDICIÓN_NO_LÓGICA',
      `La condición de \`${label}\` tiene que ser \`verdadero\` o \`falso\`, pero vale ${repr(value)}.`,
      node,
      conditionHint(value),
    );
  }

  private nonBooleanLogical(node: ast.Logical, value: Value, side: ast.Expression): CodexivoError {
    return this.runtimeError(
      'OPERANDO_NO_LÓGICO',
      `\`${node.operator}\` une valores \`verdadero\` o \`falso\`, pero recibió ${repr(value)}.`,
      side,
      conditionHint(value),
    );
  }

  private emitOperation(operator: string, operands: Value[], result: Value, node: ast.Node): void {
    this.emit({
      type: 'opera',
      operator,
      operands: operands.map(serialize),
      result: serialize(result),
      nodeId: node.id,
      span: node.span,
    });
  }

  private emit(event: DistributiveOmit<MachineEvent, 'operations' | 'depth'>): void {
    if (!this.onEvent) return;
    this.onEvent({ ...event, operations: this.operations, depth: this.frames.length } as MachineEvent);
  }
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

const splitLines = (text: string): string[] => text.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');

const formatCount = (count: number): string => count.toLocaleString('es-MX').replace(/,/g, ' ');

const describeCallee = (node: ast.Call): string => {
  if (node.callee.kind === 'Identifier') return node.callee.name;
  return 'esto';
};

const conditionHint = (value: Value): string | undefined => {
  switch (typeOf(value)) {
    case 'número':
      return `¿Quisiste comparar? Por ejemplo: \`x != 0\` o \`x > 0\`.`;
    case 'texto':
      return '¿Quisiste comparar? Por ejemplo: `texto != ""`.';
    case 'lista':
      return '¿Quisiste decir `longitud(lista) > 0`?';
    case 'nulo':
      return '¿Quisiste decir `x != nulo`?';
    default:
      return undefined;
  }
};

const checkArity = (
  expected: number | [number, number],
  received: number,
  name: string,
  fail: (message: string, hint?: string) => CodexivoError,
): void => {
  const [min, max] = typeof expected === 'number' ? [expected, expected] : expected;
  if (received >= min && received <= max) return;
  const plural = (count: number) => (count === 1 ? '1 valor' : `${count} valores`);
  let wanted: string;
  if (min === max) wanted = plural(min);
  else if (max === Infinity) wanted = `al menos ${plural(min)}`;
  else wanted = `entre ${min} y ${plural(max)}`;
  throw fail(`\`${name}\` espera ${wanted}, pero recibió ${received}.`);
};
