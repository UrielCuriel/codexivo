export enum ObjectType {
  BOOLEAN = 'BOOLEAN',
  NUMBER = 'NUMBER',
  NULL = 'NULL',
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

export class Boolean implements Object {
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
