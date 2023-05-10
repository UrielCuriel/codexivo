import { Token } from "./token";

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
      return "";
    }
  }

  toString(): string {
    return this.statements.map((s) => s.toString()).join("");
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
  constructor(
    token: Token,
    public name?: Identifier,
    public value?: Expression
  ) {
    super(token);
  }
  toString(): string {
    return `${this.tokenLiteral()} ${this.name.toString()} = ${
      this.value?.toString() ?? ""
    };`;
  }
}

export class ReturnStatement extends Statement {
  constructor(token: Token, public returnValue?: Expression) {
    super(token);
  }

  toString(): string {
    return `${this.tokenLiteral()} ${this.returnValue?.toString() ?? ""};`;
  }
}

export class ExpressionStatement extends Statement {
  constructor(token: Token, public expression?: Expression) {
    super(token);
  }

  toString(): string {
    return `${this.expression?.toString() ?? ""}`;
  }
}

export class Integer extends Expression {
  constructor(token: Token, public value?: number) {
    super(token);
  }
  toString(): string {
    return this.value?.toString() ?? "";
  }
}

export class PrefixExpression extends Expression {
  constructor(
    token: Token,
    public operator?: string,
    public right?: Expression
  ) {
    super(token);
  }
  toString(): string {
    return `(${this.operator}${this.right?.toString() ?? ""})`;
  }
}

export class InfixExpression extends Expression {
  constructor(
    token: Token,
    public left?: Expression,
    public operator?: string,
    public right?: Expression
  ) {
    super(token);
  }
  toString(): string {
    return `(${this.left?.toString() ?? ""} ${this.operator} ${
      this.right?.toString() ?? ""
    })`;
  }
}
