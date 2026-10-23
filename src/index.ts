export { prepare, run, Session } from './engine';
export type { PreparedProgram, RunOptions, RunResult } from './engine';

export { CodexivoError, formatError } from './errors';
export type { ErrorInfo, ErrorKind } from './errors';

export { tokenize } from './syntax/lexer';
export type { LexResult } from './syntax/lexer';
export { parse } from './syntax/parser';
export type { ParseResult } from './syntax/parser';
export { TokenType, KEYWORDS, isKeyword } from './syntax/token';
export type { Token, Span, Position } from './syntax/token';
export { childrenOf, walk } from './syntax/ast';
export type * as ast from './syntax/ast';

export { compile } from './runtime/compiler';
export type { Chunk, Instruction, DecisionLabel } from './runtime/compiler';
export { Machine, serialize } from './runtime/machine';
export type {
  MachineEvent,
  MachineOptions,
  MachineStatus,
  SerializedValue,
  Snapshot,
  FrameSnapshot,
  HeapEntry,
} from './runtime/machine';
export { natives } from './runtime/builtins';
export { repr, show, typeOf, equals, Scope, WAIT_FOR_INPUT } from './runtime/values';
export type {
  Value,
  ListValue,
  DictValue,
  DictKey,
  ProcedureValue,
  NativeValue,
  NativeContext,
  TypeName,
} from './runtime/values';

export { createWorld, validateWorld, checkGoal, DIRECTIONS } from './world';
export type {
  World,
  WorldDefinition,
  WorldState,
  WorldGoal,
  WorldValidationError,
  GoalDifference,
  Wall,
  BeeperPile,
  BeeperCount,
  Robot,
  RobotEvent,
  RobotSnapshot,
  RobotAction,
  Direction,
} from './world';
