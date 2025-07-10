import { Block, Identifier } from './ast';

export enum ObjectType {
  BOOLEAN = 'BOOLEAN',
  BUILTIN = 'BUILTIN',
  ERROR = 'ERROR',
  FUNCTION = 'FUNCTION',
  NUMBER = 'NUMBER',
  NULL = 'NULL',
  RETURN = 'RETURN',
  STRING = 'STRING',
}

export interface Object {
  type(): ObjectType;
  inspect(): string;
}

export class Number implements Object {
  constructor(public value: number) {}

  type(): ObjectType {
    return ObjectType.NUMBER;
  }

  inspect(): string {
    return `${this.value}`;
  }
}

export class BooleanObj implements Object {
  constructor(public value: boolean) {}

  type(): ObjectType {
    return ObjectType.BOOLEAN;
  }

  inspect(): string {
    return `${this.value ? 'verdadero' : 'falso'}`;
  }
}

export class Null implements Object {
  type(): ObjectType {
    return ObjectType.NULL;
  }

  inspect(): string {
    return 'nulo';
  }
}

export class Return implements Object {
  constructor(public value: Object) {}

  type(): ObjectType {
    return ObjectType.RETURN;
  }

  inspect(): string {
    return this.value.inspect();
  }
}

export class Error implements Object {
  constructor(public message: string) {}

  type(): ObjectType {
    return ObjectType.ERROR;
  }

  inspect(): string {
    return `ERROR: ${this.message}`;
  }
}

export class Environment {
  store: Map<string, Object> = new Map();
  outer?: Environment;

  constructor(outer?: Environment) {
    this.outer = outer;
  }

  get(name: string): Object | undefined {
    const obj = this.store.get(name);
    if (obj) {
      return obj;
    }

    if (this.outer) {
      return this.outer.get(name);
    }

    return undefined;
  }

  set(name: string, value: Object): Object {
    this.store.set(name, value);
    return value;
  }

  delete(name: string): void {
    this.store.delete(name);
  }
}

export class Function implements Object {
  constructor(public parameters: Identifier[], public body: Block, public env: Environment) {}

  type(): ObjectType {
    return ObjectType.FUNCTION;
  }

  inspect(): string {
    return `procedimiento(${this.parameters.map(p => p.toString()).join(', ')}) {\n${this.body.statements
      .map(s => s.toString())
      .join('\n')}\n}`;
  }
}

export class StringObj implements Object {
  constructor(public value: string) {}

  type(): ObjectType {
    return ObjectType.STRING;
  }

  inspect(): string {
    return this.value;
  }
}

export type BuiltinFunction = (...args: Object[]) => Object;

export class Builtin implements Object {
  constructor(public fn: BuiltinFunction) {}

  type(): ObjectType {
    return ObjectType.BUILTIN;
  }

  inspect(): string {
    return 'builtin function';
  }
}
