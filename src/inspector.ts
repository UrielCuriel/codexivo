import { Program } from './ast';

/**
 * function para reprecentar el AST de un programa en un arbol como este:
 *  Program
 *  |- Statements
 *  | |- variable orden =
 *  | | |- procedimiento (parametros)
 *  | | | |- si (condicion)
 *  | | | | |- regresa (valor)
 *  | | | |- si_no
 *  | | | | |- regresa (valor)
 */
export const inspect = (program: Program) => {
  const stringfied = JSON.stringify(program, null, 2);

  const innerInspect = (node: any, indent: number): string => {
    if (typeof node === 'string' || typeof node === 'number') {
      console.log(`${'| '.repeat(indent)}|-${node}`);
      return;
    }

    if (node.token) {
      console.log(`${'| '.repeat(indent)}|-${node.token.type} ${node.token.literal}`);
    }

    const keys = [
      'statements',
      'parameters',
      'condition',
      'consequence',
      'alternative',
      'body',
      'value',
      'left',
      'right',
      'expression',
      'arguments_',
    ];

    for (const key of keys) {
      if (node[key]) {
        console.log(`${'| '.repeat(indent)}|-${key}`);
        if (Array.isArray(node[key])) {
          for (const element of node[key]) {
            innerInspect(element, indent + 1);
          }
        } else {
          innerInspect(node[key], indent + 1);
        }
      }
    }
  };
  innerInspect(program, 0);
};
