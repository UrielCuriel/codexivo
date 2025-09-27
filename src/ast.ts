import { Token } from './token';

export interface ASTNode {
  line: number;
  column: number;
  tokenLiteral(): string;
  toString(): string;
}

export class Statement implements ASTNode {
  token: Token;
  line: number;
  column: number;
  constructor(token: Token) {
    this.token = token;
    this.line = token.line;
    this.column = token.column;
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
  line: number;
  column: number;

  constructor(token: Token) {
    this.token = token;
    this.line = token.line;
    this.column = token.column;
  }

  tokenLiteral(): string {
    return this.token.literal;
  }
  toString(): string {
    return this.token.literal;
  }
}

export class Program implements ASTNode {
  line: number;
  column: number;
  constructor(public statements: Statement[]) {
    this.statements = statements;
    if (this.statements.length > 0) {
      this.line = this.statements[0].line;
      this.column = this.statements[0].column;
    } else {
      this.line = 0;
      this.column = 0;
    }
  }

  tokenLiteral(): string {
    if (this.statements.length > 0) {
      return this.statements[0].tokenLiteral();
    } else {
      return '';
    }
  }

  toString(indentation = ''): string {
    return this.statements.map(statement => statement.toString()).join('');
  }

  inspect(): string {
    return JSON.stringify(this, null, 2);
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
    const identifier = this.name ? this.name.toString() : '';
    const value = this.value ? this.value.toString() : '';
    return `${this.tokenLiteral()} ${identifier} = ${value};`;
  }
}

export class AssignmentStatement extends Statement {
  constructor(token: Token, public name?: Identifier, public operator?: string, public value?: Expression) {
    super(token);
  }
  toString(): string {
    const identifier = this.name ? this.name.toString() : '';
    const value = this.value ? this.value.toString() : '';
    return `${identifier} ${this.operator} ${value};`;
  }
}

export class ReturnStatement extends Statement {
  constructor(token: Token, public returnValue?: Expression) {
    super(token);
  }

  toString(): string {
    const value = this.returnValue ? this.returnValue.toString() : '';
    return `${this.tokenLiteral()} ${value};`;
  }
}

export class ExpressionStatement extends Statement {
  constructor(token: Token, public expression?: Expression) {
    super(token);
  }

  toString(): string {
    return this.expression ? this.expression.toString() : '';
  }
}

export class Number extends Expression {
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
    return this.statements.map(s => s.toString()).join(' ');
  }
}

export class If extends Expression {
  constructor(
    token: Token,
    public condition?: Expression,
    public consequence?: Block,
    public alternative?: Block | If,
  ) {
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

export class For extends Expression {
  constructor(
    token: Token,
    public initializer?: Expression,
    public condition?: Expression,
    public increment?: Expression,
    public body?: Block,
  ) {
    super(token);
  }
  toString(): string {
    return `para ${this.initializer?.toString()} ${this.condition?.toString()} ${this.increment?.toString()} ${this.body?.toString()}`;
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
    const parameters = (this.parameters ?? []).map(parameter => parameter.toString()).join(', ');
    const body = this.body ? this.body.toString() : '';
    return `${this.tokenLiteral()} (${parameters}) ${body}`;
  }
}

export class Call extends Expression {
  constructor(token: Token, public function_: Expression, public arguments_?: Expression[]) {
    super(token);
  }

  toString(): string {
    const args = (this.arguments_ ?? []).map(argument => argument.toString()).join(', ');
    return `${this.function_.toString()}(${args})`;
  }
}

export class StringLiteral extends Expression {
  constructor(token: Token, public value: string) {
    super(token);
  }

  toString(): string {
    return this.value;
  }
}

export class ArrayLiteral extends Expression {
  constructor(token: Token, public elements?: Expression[]) {
    super(token);
  }

  toString(): string {
    const elements = (this.elements ?? []).map(element => element.toString()).join(', ');
    return `[${elements}]`;
  }
}

export class Index extends Expression {
  constructor(token: Token, public left: Expression, public index?: Expression) {
    super(token);
  }

  toString(): string {
    const index = this.index ? this.index.toString() : '';
    return `${this.left.toString()}[${index}]`;
  }
}

export class Domain extends Statement {
  constructor(token: Token, public name?: Identifier, public body?: Block) {
    super(token);
  }

  toString(): string {
    const name = this.name ? this.name.toString() : '';
    const body = this.body ? this.body.toString() : '';
    return `dominio ${name} { ${body} }`;
  }
}

export class MemberAccess extends Expression {
  constructor(token: Token, public object: Expression, public property: Identifier) {
    super(token);
  }

  toString(): string {
    return `${this.object.toString()}.${this.property.toString()}`;
  }
}
