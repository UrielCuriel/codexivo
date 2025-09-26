import * as ast from '../ast';
import {
  Boolean as BooleanObj,
  Builtin,
  Environment,
  Error as ErrorObj,
  Function as RuntimeFunction,
  Null,
  Number as NumberObj,
  Object as RuntimeObject,
  Return,
  String as StringObj,
} from '../object';

export interface Breakpoint {
  line: number;
  column?: number;
  once?: boolean;
  label?: string;
}

export interface RuntimeTracerOptions {
  breakpoints?: Breakpoint[];
  stepMode?: boolean;
}

export interface RuntimeValueSnapshot {
  type: string;
  value: unknown;
  repr: string;
}

export interface ScopeSnapshot {
  level: number;
  variables: Record<string, RuntimeValueSnapshot>;
}

export interface EnvironmentSnapshot {
  scopes: ScopeSnapshot[];
}

export type EnvironmentChangeType = 'add' | 'update' | 'delete';

export interface EnvironmentChange {
  scope: number;
  name: string;
  type: EnvironmentChangeType;
  before?: RuntimeValueSnapshot;
  after?: RuntimeValueSnapshot;
}

export type CallFrameType = 'program' | 'function' | 'builtin';

export interface CallFrame {
  name: string;
  type: CallFrameType;
  location?: { line?: number; column?: number };
}

export type IOEventType = 'input' | 'output';

export interface IOEvent {
  type: IOEventType;
  value: unknown;
  at?: { line?: number; column?: number };
}

export interface TraceEvent {
  step: number;
  nodeType: string;
  operation: string;
  position: { line: number; column: number };
  metadata: Record<string, unknown>;
  environment: EnvironmentSnapshot;
  changes: EnvironmentChange[];
  callStack: CallFrame[];
  result?: RuntimeValueSnapshot;
  breakpoint: boolean;
  stepMode: boolean;
  ioEvents: IOEvent[];
}

export interface RuntimeTrace {
  events: TraceEvent[];
  breakpoints: Breakpoint[];
  io: IOEvent[];
}

export class RuntimeTracer implements Iterable<TraceEvent> {
  private readonly options: Required<RuntimeTracerOptions>;
  private readonly events: TraceEvent[] = [];
  private readonly breakpointMap: Map<string, Breakpoint> = new Map();
  private callStack: CallFrame[] = [];
  private ioEvents: IOEvent[] = [];
  private ioLog: IOEvent[] = [];
  private lastSnapshot: EnvironmentSnapshot | null = null;
  private stepCounter = 0;
  private readIndex = 0;

  constructor(options: RuntimeTracerOptions = {}) {
    this.options = {
      breakpoints: options.breakpoints ?? [],
      stepMode: options.stepMode ?? false,
    };

    for (const breakpoint of this.options.breakpoints) {
      this.registerBreakpoint(breakpoint);
    }
  }

  public enterFrame(frame: CallFrame): void {
    this.callStack = [...this.callStack, frame];
  }

  public exitFrame(): void {
    if (this.callStack.length === 0) {
      return;
    }
    this.callStack = this.callStack.slice(0, this.callStack.length - 1);
  }

  public recordIO(event: IOEvent): void {
    this.ioEvents = [...this.ioEvents, event];
    this.ioLog = [...this.ioLog, event];
  }

  public addBreakpoint(breakpoint: Breakpoint): void {
    this.registerBreakpoint(breakpoint);
  }

  public clearBreakpoints(): void {
    this.breakpointMap.clear();
  }

  public setStepMode(enabled: boolean): void {
    this.options.stepMode = enabled;
  }

  public nextStep(): TraceEvent | undefined {
    if (this.readIndex >= this.events.length) {
      return undefined;
    }
    const event = this.events[this.readIndex];
    this.readIndex += 1;
    return event;
  }

  public resetSteps(): void {
    this.readIndex = 0;
  }

  public record({
    node,
    env,
    result,
    operation,
  }: {
    node: ast.ASTNode;
    env: Environment;
    result?: RuntimeObject;
    operation: string;
  }): TraceEvent {
    const environment = this.snapshotEnvironment(env);
    const changes = this.computeChanges(environment);
    this.lastSnapshot = environment;

    const event: TraceEvent = {
      step: ++this.stepCounter,
      nodeType: node.constructor.name,
      operation,
      position: {
        line: node.line ?? 0,
        column: node.column ?? 0,
      },
      environment,
      changes,
      callStack: [...this.callStack],
      metadata: this.describeNode(node),
      result: this.serializeObject(result),
      breakpoint: this.matchBreakpoint(node.line, node.column),
      stepMode: this.options.stepMode,
      ioEvents: this.consumeIOEvents(),
    };

    this.events.push(event);

    return event;
  }

  public getTrace(): RuntimeTrace {
    return {
      events: [...this.events],
      breakpoints: this.listBreakpoints(),
      io: [...this.ioLog],
    };
  }

  public [Symbol.iterator](): Iterator<TraceEvent> {
    return this.events[Symbol.iterator]();
  }

  private registerBreakpoint(breakpoint: Breakpoint): void {
    this.breakpointMap.set(this.getBreakpointKey(breakpoint.line, breakpoint.column), breakpoint);
  }

  private listBreakpoints(): Breakpoint[] {
    const uniqueKeys = new Set<string>();
    const breakpoints: Breakpoint[] = [];

    for (const [key, breakpoint] of this.breakpointMap.entries()) {
      const signature = `${breakpoint.line}:${breakpoint.column ?? '*'}:${breakpoint.label ?? ''}`;
      if (uniqueKeys.has(signature)) {
        continue;
      }
      uniqueKeys.add(signature);
      breakpoints.push(breakpoint);
    }

    return breakpoints;
  }

  private consumeIOEvents(): IOEvent[] {
    if (this.ioEvents.length === 0) {
      return [];
    }
    const events = [...this.ioEvents];
    this.ioEvents = [];
    return events;
  }

  private getBreakpointKey(line?: number, column?: number): string {
    return `${line ?? -1}:${column ?? -1}`;
  }

  private matchBreakpoint(line?: number, column?: number): boolean {
    if (line === undefined) {
      return false;
    }

    const exact = this.breakpointMap.get(this.getBreakpointKey(line, column));
    const byLine = this.breakpointMap.get(this.getBreakpointKey(line, undefined));
    const matched = exact ?? byLine;

    if (!matched) {
      return false;
    }

    if (matched.once) {
      this.breakpointMap.delete(this.getBreakpointKey(matched.line, matched.column));
      if (matched.column === undefined) {
        this.breakpointMap.delete(this.getBreakpointKey(matched.line, undefined));
      }
    }

    return true;
  }

  private snapshotEnvironment(env: Environment): EnvironmentSnapshot {
    const scopes: ScopeSnapshot[] = [];
    const chain: Environment[] = [];
    let current: Environment | undefined = env;

    while (current) {
      chain.push(current);
      current = current.outer;
    }

    chain.reverse().forEach((scopeEnv, index) => {
      const variables: Record<string, RuntimeValueSnapshot> = {};
      for (const [name, value] of scopeEnv.store.entries()) {
        variables[name] = this.serializeObject(value) ?? {
          type: 'UNKNOWN',
          value: undefined,
          repr: 'indefinido',
        };
      }
      scopes.push({ level: index, variables });
    });

    return { scopes };
  }

  private computeChanges(current: EnvironmentSnapshot): EnvironmentChange[] {
    if (!this.lastSnapshot) {
      const initialChanges: EnvironmentChange[] = [];
      current.scopes.forEach(scope => {
        for (const [name, snapshot] of Object.entries(scope.variables)) {
          initialChanges.push({
            scope: scope.level,
            name,
            type: 'add',
            after: snapshot,
          });
        }
      });
      return initialChanges;
    }

    const changes: EnvironmentChange[] = [];
    const maxLength = Math.max(current.scopes.length, this.lastSnapshot.scopes.length);

    for (let index = 0; index < maxLength; index++) {
      const currentScope = current.scopes[index];
      const previousScope = this.lastSnapshot.scopes[index];
      const currentVariables = currentScope?.variables ?? {};
      const previousVariables = previousScope?.variables ?? {};

      for (const [name, snapshot] of Object.entries(currentVariables)) {
        if (!(name in previousVariables)) {
          changes.push({ scope: currentScope.level, name, type: 'add', after: snapshot });
        } else if (!this.valueEquals(previousVariables[name], snapshot)) {
          changes.push({
            scope: currentScope.level,
            name,
            type: 'update',
            before: previousVariables[name],
            after: snapshot,
          });
        }
      }

      for (const [name, snapshot] of Object.entries(previousVariables)) {
        if (!(name in currentVariables)) {
          changes.push({ scope: previousScope.level, name, type: 'delete', before: snapshot });
        }
      }
    }

    return changes;
  }

  private valueEquals(a?: RuntimeValueSnapshot, b?: RuntimeValueSnapshot): boolean {
    if (!a || !b) {
      return false;
    }
    return a.type === b.type && JSON.stringify(a.value) === JSON.stringify(b.value);
  }

  private serializeObject(obj?: RuntimeObject): RuntimeValueSnapshot | undefined {
    if (!obj) {
      return undefined;
    }

    if (obj instanceof NumberObj) {
      return { type: obj.type(), value: obj.value, repr: obj.inspect() };
    }

    if (obj instanceof BooleanObj) {
      return { type: obj.type(), value: obj.value, repr: obj.inspect() };
    }

    if (obj instanceof StringObj) {
      return { type: obj.type(), value: obj.value, repr: obj.inspect() };
    }

    if (obj instanceof Null) {
      return { type: obj.type(), value: null, repr: obj.inspect() };
    }

    if (obj instanceof ErrorObj) {
      return { type: obj.type(), value: obj.message, repr: obj.inspect() };
    }

    if (obj instanceof Return) {
      const inner = this.serializeObject(obj.value);
      return {
        type: obj.type(),
        value: inner?.value ?? null,
        repr: inner?.repr ?? obj.inspect(),
      };
    }

    if (obj instanceof RuntimeFunction) {
      return {
        type: obj.type(),
        value: {
          parameters: obj.parameters.map(parameter => parameter.value),
          hasName: Boolean(obj.name),
        },
        repr: obj.inspect(),
      };
    }

    if (obj instanceof Builtin) {
      return {
        type: obj.type(),
        value: 'builtin',
        repr: obj.inspect(),
      };
    }

    return { type: 'UNKNOWN', value: undefined, repr: 'indefinido' };
  }

  private describeNode(node: ast.ASTNode): Record<string, unknown> {
    const metadata: Record<string, unknown> = { type: node.constructor.name };

    if (node instanceof ast.Program) {
      metadata.kind = 'Program';
      metadata.size = node.statements.length;
    } else if (node instanceof ast.Statement) {
      metadata.kind = 'Statement';
    } else if (node instanceof ast.Expression) {
      metadata.kind = 'Expression';
    }

    if (node instanceof ast.LetStatement) {
      metadata.identifier = node.name?.value ?? null;
    }

    if (node instanceof ast.Identifier) {
      metadata.name = node.value;
    }

    if (node instanceof ast.Call) {
      metadata.arguments = node.arguments_?.length ?? 0;
    }

    if (node instanceof ast.Function) {
      metadata.parameters = node.parameters?.map(parameter => parameter.value) ?? [];
      metadata.name = node.name?.value ?? null;
    }

    if (node instanceof ast.Number) {
      metadata.value = node.value;
    }

    if (node instanceof ast.Boolean) {
      metadata.value = node.value;
    }

    if (node instanceof ast.StringLiteral) {
      metadata.value = node.value;
    }

    return metadata;
  }
}
