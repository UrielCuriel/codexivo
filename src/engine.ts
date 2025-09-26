import { serializeProgram, SerializedASTNode, SerializerOptions } from './astSerializer';
import * as ast from './ast';
import { createEvaluator, EvaluationOptions } from './evaluator';
import { Lexer } from './lexer';
import { Environment, Object as RuntimeObject } from './object';
import { Parser } from './parser';
import { RuntimeTrace, RuntimeTracer } from './runtime/tracer';

export interface ParseResult {
  program: ast.Program | null;
  errors: string[];
}

export interface ASTResult {
  ast: SerializedASTNode | null;
  errors: string[];
  program: ast.Program | null;
}

export interface RunOptions extends EvaluationOptions {
  trace?: boolean;
  environment?: Environment;
}

export interface RunResult {
  result: RuntimeObject | null;
  errors: string[];
  trace?: RuntimeTrace;
  program: ast.Program | null;
  environment: Environment;
}

export class CodexivoEngine {
  parse(source: string): ParseResult {
    const lexer = new Lexer(source);
    const parser = new Parser(lexer);
    const program = parser.parseProgram();
    return {
      program,
      errors: [...parser.errors],
    };
  }

  getAST(source: string, options: SerializerOptions = {}): ASTResult {
    const { program, errors } = this.parse(source);
    if (errors.length > 0 || !program) {
      return { ast: null, errors, program };
    }
    return {
      ast: serializeProgram(program, options),
      errors: [],
      program,
    };
  }

  run(source: string, options: RunOptions = {}): RunResult {
    const { program, errors } = this.parse(source);
    if (errors.length > 0 || !program) {
      return {
        result: null,
        errors,
        program,
        trace: undefined,
        environment: options.environment ?? new Environment(),
      };
    }

    const {
      trace,
      tracer: providedTracer,
      environment: providedEnvironment,
      ...evaluatorOptions
    } = options;

    const environment = providedEnvironment ?? new Environment();
    const tracer = providedTracer ?? (trace ? new RuntimeTracer(evaluatorOptions) : undefined);
    const evaluator = createEvaluator({ ...(evaluatorOptions as EvaluationOptions), tracer });
    const result = evaluator.evaluate(program, environment, program.line, program.column);
    return {
      result,
      errors: [],
      trace: tracer?.getTrace(),
      program,
      environment,
    };
  }

  createTracer(options: EvaluationOptions = {}): RuntimeTracer {
    return options.tracer ?? new RuntimeTracer(options);
  }
}
