import * as ast from './ast';

export interface SerializedASTChild {
  relation: string;
  node: SerializedASTNode;
}

export interface SerializedASTNode {
  id: string;
  type: string;
  position: { line: number; column: number };
  tokenLiteral: string;
  metadata: Record<string, unknown>;
  parentId: string | null;
  children: SerializedASTChild[];
}

export interface SerializerOptions {
  includeEmptyChildren?: boolean;
}

export const serializeProgram = (
  program: ast.Program,
  options: SerializerOptions = {},
): SerializedASTNode => {
  const idGenerator = createIdGenerator();
  return serializeNode(program, null, idGenerator, options);
};

export const serializeNode = (
  node: ast.ASTNode,
  parentId: string | null,
  idGenerator: () => string,
  options: SerializerOptions = {},
): SerializedASTNode => {
  const id = idGenerator();
  const base: SerializedASTNode = {
    id,
    type: node.constructor.name,
    position: resolvePosition(node),
    tokenLiteral: node.tokenLiteral(),
    metadata: collectMetadata(node),
    parentId,
    children: [],
  };

  const children = collectChildren(node);
  for (const child of children) {
    if (!child.node) {
      if (options.includeEmptyChildren) {
        base.children.push({ relation: child.relation, node: createEmptyNode(idGenerator, id, child.relation) });
      }
      continue;
    }
    base.children.push({
      relation: child.relation,
      node: serializeNode(child.node, id, idGenerator, options),
    });
  }

  return base;
};

const collectMetadata = (node: ast.ASTNode): Record<string, unknown> => {
  const metadata: Record<string, unknown> = {};

  if (node instanceof ast.Program) {
    metadata.kind = 'Program';
  } else if (node instanceof ast.Statement) {
    metadata.kind = 'Statement';
  } else if (node instanceof ast.Expression) {
    metadata.kind = 'Expression';
  }

  if (node instanceof ast.LetStatement) {
    metadata.identifier = node.name?.value ?? null;
  }
  if (node instanceof ast.ReturnStatement) {
    metadata.hasValue = Boolean(node.returnValue);
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
  if (node instanceof ast.Identifier) {
    metadata.name = node.value;
  }
  if (node instanceof ast.Prefix) {
    metadata.operator = node.operator;
  }
  if (node instanceof ast.Infix) {
    metadata.operator = node.operator;
  }
  if (node instanceof ast.Function) {
    metadata.parameters = node.parameters?.map(parameter => parameter.value) ?? [];
    metadata.isAnonymous = node.isAnonymous ?? false;
    metadata.name = node.name?.value ?? null;
  }
  if (node instanceof ast.Call) {
    metadata.arguments = node.arguments_?.length ?? 0;
    metadata.calleeType = node.function_?.constructor?.name ?? 'Unknown';
  }
  if (node instanceof ast.Block) {
    metadata.size = node.statements.length;
  }
  if (node instanceof ast.Program) {
    metadata.size = node.statements.length;
  }
  if (node instanceof ast.ArrayLiteral) {
    metadata.length = node.elements?.length ?? 0;
  }

  return metadata;
};

interface ChildRelation {
  relation: string;
  node?: ast.ASTNode;
}

const collectChildren = (node: ast.ASTNode): ChildRelation[] => {
  if (node instanceof ast.Program) {
    return node.statements.map(statement => ({ relation: 'statement', node: statement }));
  }
  if (node instanceof ast.LetStatement) {
    return compact([
      { relation: 'identifier', node: node.name },
      { relation: 'value', node: node.value },
    ]);
  }
  if (node instanceof ast.ReturnStatement) {
    return compact([{ relation: 'value', node: node.returnValue }]);
  }
  if (node instanceof ast.ExpressionStatement) {
    return compact([{ relation: 'expression', node: node.expression }]);
  }
  if (node instanceof ast.Prefix) {
    return compact([{ relation: 'right', node: node.right }]);
  }
  if (node instanceof ast.Infix) {
    return compact([
      { relation: 'left', node: node.left },
      { relation: 'right', node: node.right },
    ]);
  }
  if (node instanceof ast.If) {
    return compact([
      { relation: 'condition', node: node.condition },
      { relation: 'consequence', node: node.consequence },
      { relation: 'alternative', node: node.alternative },
    ]);
  }
  if (node instanceof ast.While) {
    return compact([
      { relation: 'condition', node: node.condition },
      { relation: 'body', node: node.body },
    ]);
  }
  if (node instanceof ast.DoWhile) {
    return compact([
      { relation: 'body', node: node.body },
      { relation: 'condition', node: node.condition },
    ]);
  }
  if (node instanceof ast.For) {
    return compact([
      { relation: 'initializer', node: node.initializer },
      { relation: 'condition', node: node.condition },
      { relation: 'increment', node: node.increment },
      { relation: 'body', node: node.body },
    ]);
  }
  if (node instanceof ast.Block) {
    return node.statements.map(statement => ({ relation: 'statement', node: statement }));
  }
  if (node instanceof ast.Function) {
    const parameterRelations = (node.parameters ?? []).map(parameter => ({ relation: 'parameter', node: parameter }));
    return [...parameterRelations, ...compact([{ relation: 'body', node: node.body }])];
  }
  if (node instanceof ast.Call) {
    const argumentRelations = (node.arguments_ ?? []).map(argument => ({ relation: 'argument', node: argument }));
    return compact([{ relation: 'function', node: node.function_ }, ...argumentRelations]);
  }
  if (node instanceof ast.ArrayLiteral) {
    return (node.elements ?? []).map(element => ({ relation: 'element', node: element }));
  }
  if (node instanceof ast.Index) {
    return compact([
      { relation: 'left', node: node.left },
      { relation: 'index', node: node.index },
    ]);
  }
  return [];
};

const compact = (relations: ChildRelation[]): ChildRelation[] => {
  return relations.filter(relation => relation.node !== null && relation.node !== undefined);
};

const resolvePosition = (node: ast.ASTNode): { line: number; column: number } => {
  if (node instanceof ast.Program && node.statements.length > 0) {
    return { line: node.statements[0].line, column: node.statements[0].column };
  }
  if (node instanceof ast.Block && node.statements.length > 0) {
    return { line: node.statements[0].line, column: node.statements[0].column };
  }
  return {
    line: node.line ?? 0,
    column: node.column ?? 0,
  };
};

const createEmptyNode = (
  idGenerator: () => string,
  parentId: string,
  relation: string,
): SerializedASTNode => ({
  id: idGenerator(),
  type: 'Empty',
  position: { line: 0, column: 0 },
  tokenLiteral: relation,
  metadata: {},
  parentId,
  children: [],
});

const createIdGenerator = (): (() => string) => {
  let counter = 0;
  return () => {
    counter += 1;
    return `node-${counter}`;
  };
};
