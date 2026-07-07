/**
 * Stringent - Type-safe Expression Parser
 *
 * Main entry points:
 * - defineNode: Create grammar node schemas
 * - createParser: Build a type-safe parser from nodes
 */

// =============================================================================
// Main API: defineNode & createParser
// =============================================================================

export {
  defineNode,
  number,
  string,
  boolean,
  nullVal,
  undefinedVal,
  ident,
  path,
  constVal,
  operand,
  rest,
  expr,
  overlapping,
} from "./schema/index.js";
export type {
  NodeSchema,
  PatternSchema,
  NumberSchema,
  StringSchema,
  BooleanSchema,
  NullSchema,
  UndefinedSchema,
  IdentSchema,
  PathSchema,
  ConstSchema,
  ExprSchema,
  ExprRole,
  Precedence,
  ConstraintSpec,
  OverlapsRef,
  ResultSpec,
  EvalFn,
  Thunked,
  InferDef,
  InferBindings,
  InferEvaluatedBindings,
} from "./schema/index.js";

export { createParser } from "./createParser.js";
export type {
  Parser,
  SafeParseResult,
  AnyAstNode,
  InferValues,
  CompileRuleOptions,
  CompiledRule,
} from "./createParser.js";
export type { ScopeAliases } from "./runtime/types.js";

// =============================================================================
// Errors
// =============================================================================

export { StringentParseError } from "./runtime/diagnostics.js";
export type { StringentError } from "./runtime/diagnostics.js";
export { EvaluationError } from "./runtime/evaluate.js";

// =============================================================================
// Types: Parse, Grammar, Context
// =============================================================================

export type { Parse, LooseAstNode, InferOfDef, ResolvedDef } from "./parse/index.js";
export type { ComputeGrammar, Grammar } from "./grammar/index.js";
export type { Context, EmptyContext, SchemaShape } from "./context.js";
export { emptyContext } from "./context.js";

// =============================================================================
// AST Node Types
// =============================================================================

export type {
  ASTNode,
  LiteralNode,
  NumberNode,
  StringNode,
  BooleanNode,
  NullNode,
  UndefinedNode,
  IdentNode,
  PathNode,
  ConstNode,
} from "./primitive/index.js";
