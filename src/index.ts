/**
 * Stringent - Type-safe Expression Parser
 *
 * Main entry points:
 * - defineNode: Create grammar node schemas
 * - createParser: Build a type-safe parser from nodes
 * - Parse<Grammar, Input, Context>: Type-level parsing
 */

// =============================================================================
// Main API: defineNode & createParser
// =============================================================================

export { defineNode, number, string, ident, constVal, lhs, rhs, expr, nullLiteral, booleanLiteral, undefinedLiteral } from "./schema/index.js";
export type {
  NodeSchema,
  PatternSchema,
  NumberSchema,
  StringSchema,
  IdentSchema,
  ConstSchema,
  NullSchema,
  BooleanSchema,
  UndefinedSchema,
  ExprSchema,
  ExprRole,
  Precedence,
  ConfigureFn,
  EvalFn,
  SchemaToType,
  InferBindings,
  InferEvaluatedBindings,
} from "./schema/index.js";

export { createParser } from "./createParser.js";
export type { Parser } from "./createParser.js";

// =============================================================================
// Types: Parse, Grammar, Context
// =============================================================================

export type { Parse, BinaryNode, ParseError, TypeMismatchError, NoMatchError } from "./parse/index.js";
export type { ComputeGrammar, Grammar } from "./grammar/index.js";
export type { Context, EmptyContext } from "./context.js";
export { emptyContext } from "./context.js";

// =============================================================================
// Primitive Node Types
// =============================================================================

export type {
  ASTNode,
  LiteralNode,
  NumberNode,
  StringNode,
  IdentNode,
  ConstNode,
  NullNode,
  BooleanNode,
  UndefinedNode,
} from "./primitive/index.js";

// =============================================================================
// Legacy Primitives (for backwards compatibility)
// =============================================================================

export {
  Number,
  String,
  Ident,
  Const,
  type IParser,
  type ParseResult,
} from "./primitive/index.js";

// =============================================================================
// Runtime Evaluation
// =============================================================================

export { evaluate, createEvaluator } from "./runtime/eval.js";
export type { EvalContext } from "./runtime/eval.js";

// =============================================================================
// Inference
// =============================================================================

export { infer } from "./runtime/infer.js";
export type { InferredType } from "./runtime/infer.js";
export type { Infer } from "./static/infer.js";

