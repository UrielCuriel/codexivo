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

export { catalog } from './catalog';
export type { Catalog, KeywordGroup, OperatorEntry, ProcedureEntry, ConstantEntry, ErrorEntry } from './catalog';
export type { ProcedureDoc, ProcedureExample, ProcedureLevel, ProcedureCategory } from './runtime/values';

export { flowGraph } from './flow';
export type { FlowGraph, FlowNode, FlowEdge, FlowNodeKind, FlowEdgeKind, FlowEdgeLabel, FlowOptions } from './flow';
export { printExpression, printStatement } from './printer';

export { evaluarReto } from './challenge';
export type { Challenge, ChallengeCase, ChallengeResult, CaseResult, JsonValue } from './challenge';
export { createSandbox } from './sandbox';
export type { Sandbox, WorkerLike } from './sandbox';
export { SandboxHost } from './sandbox-host';
export type {
  SandboxOptions,
  SandboxRequest,
  SandboxResponse,
  EventDetail,
  Loaded,
  Progress,
  Stopped,
  StopReason,
} from './sandbox-host';
