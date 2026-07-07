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
  ident,
  path,
  constVal,
  lhs,
  rhs,
  expr,
  overlapping,
} from "./schema/index.js";
export type {
  NodeSchema,
  PatternSchema,
  NumberSchema,
  StringSchema,
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

export type { Parse, LooseAstNode } from "./parse/index.js";
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
  IdentNode,
  PathNode,
  ConstNode,
} from "./primitive/index.js";
