import * as ast from './ast';
import { Integer, Object } from './object';

export const evaluate = (node: ast.ASTNode): Object => {
  const type = typeof node;

  console.log('type', type);

  switch (type) {
    case typeof ast.Program:
      return evaluateStatements((node as ast.Program).statements);
  }
};

const evaluateStatements = (statements: ast.Statement[]): Object => {
  let result: Object;

  for (const statement of statements) {
    result = evaluate(statement);
  }

  return result;
};
