import { Token } from './token';

export interface ASTNode {
  tokenLiteral(): string;
  toString(): string;
}

export class Statement implements ASTNode {
  token: Token;
  constructor(token: Token) {
    this.token = token;
  }
  tokenLiteral(): string {
    return this.token.literal;
  }
  toString(): string {
    return this.token.literal;
  }
}

export class Expression implements ASTNode {
  token: Token;
  constructor(token: Token) {
    this.token = token;
  }
  tokenLiteral(): string {
    return this.token.literal;
  }
  toString(): string {
    return this.token.literal;
  }
}

export class Program implements ASTNode {
  constructor(public statements: Statement[]) {
    this.statements = statements;
  }

  tokenLiteral(): string {
    if (this.statements.length > 0) {
      return this.statements[0].tokenLiteral();
    } else {
      return '';
    }
  }

  toString(): string {
    return this.statements.map(s => s.toString()).join('');
  }
}

export class Identifier extends Expression {
  constructor(token: Token, public value: string) {
    super(token);
    this.value = value;
  }

  toString(): string {
    return this.value;
  }
}

export class LetStatement extends Statement {
  constructor(token: Token, public name?: Identifier, public value?: Expression) {
    super(token);
  }
  toString(): string {
    return `${this.tokenLiteral()} ${this.name.toString()} = ${this.value?.toString() ?? ''};`;
  }
}

export class ReturnStatement extends Statement {
  constructor(token: Token, public returnValue?: Expression) {
    super(token);
  }

  toString(): string {
    return `${this.tokenLiteral()} ${this.returnValue?.toString() ?? ''};`;
  }
}

export class ExpressionStatement extends Statement {
  constructor(token: Token, public expression?: Expression) {
    super(token);
  }

  toString(): string {
    return `${this.expression?.toString() ?? ''}`;
  }
}

export class Integer extends Expression {
  constructor(token: Token, public value?: number) {
    super(token);
  }
  toString(): string {
    return this.value?.toString() ?? '';
  }
}

export class Prefix extends Expression {
  constructor(token: Token, public operator?: string, public right?: Expression) {
    super(token);
  }
  toString(): string {
    return `(${this.operator}${this.right?.toString() ?? ''})`;
  }
}

export class Infix extends Expression {
  constructor(token: Token, public left?: Expression, public operator?: string, public right?: Expression) {
    super(token);
  }
  toString(): string {
    return `(${this.left?.toString() ?? ''} ${this.operator} ${this.right?.toString() ?? ''})`;
  }
}

export class Boolean extends Expression {
  constructor(token: Token, public value?: boolean) {
    super(token);
  }
  toString(): string {
    return this.tokenLiteral();
  }
}

export class Block extends Statement {
  constructor(token: Token, public statements: Statement[]) {
    super(token);
  }
  toString(): string {
    return this.statements.map(s => s.toString()).join('');
  }
}

export class If extends Expression {
  constructor(token: Token, public condition?: Expression, public consequence?: Block, public alternative?: Block) {
    super(token);
  }
  toString(): string {
    let result = `si ${this.condition?.toString()} ${this.consequence?.toString()}`;
    if (this.alternative) {
      result += ` si_no ${this.alternative.toString()}`;
    }
    return result;
  }
}

export class While extends Expression {
  constructor(token: Token, public condition?: Expression, public body?: Block) {
    super(token);
  }
  toString(): string {
    return `mientras ${this.condition?.toString()} ${this.body?.toString()}`;
  }
}

export class DoWhile extends Expression {
  constructor(token: Token, public condition?: Expression, public body?: Block) {
    super(token);
  }
  toString(): string {
    return `hacer ${this.body?.toString()} hasta_que ${this.condition?.toString()}`;
  }
}

export class Function extends Expression {
  constructor(
    token: Token,
    public parameters?: Identifier[],
    public body?: Block,
    public name?: Identifier,
    public isAnonymous: boolean = false,
  ) {
    super(token);
  }
  toString(): string {
    return `${this.tokenLiteral()} ${this.name?.toString()}(${this.parameters
      .map(p => p.toString())
      .join(', ')}) ${this.body?.toString()}`;
  }
}
