export enum ObjectType {
  BOOLEAN = 'BOOLEAN',
  INTEGER = 'INTEGER',
  NULL = 'NULL',
}

export interface Object {
  type(): ObjectType;
  inspect(): string;
}

export class Integer implements Object {
  constructor(public value: number) {
    this.value = parseInt(value.toString());
  }

  type(): ObjectType {
    return ObjectType.INTEGER;
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
