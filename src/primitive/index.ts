/**
 * AST Node Types
 *
 * The node types produced by parsing, shared by the type-level and runtime
 * engines. Every node carries an `outputSchema` string describing the type
 * of value the node produces when evaluated.
 */

// Re-export Context for convenience
export type { Context } from "../context.js";

// =============================================================================
// Type Utilities
// =============================================================================

/**
 * Convert a numeric string literal to its number literal type.
 * "1" → 1, "-1.5" → -1.5. Non-canonical numerals ("007", "1.0") and
 * non-numeric strings widen to `number`.
 */
export type ToNumber<S extends string> = S extends `${infer N extends number}`
  ? N
  : number;

// =============================================================================
// Node Types
// =============================================================================

export interface ASTNode<TType extends string = string, TOutputSchema = unknown> {
  node: TType;
  outputSchema: TOutputSchema;
}

export interface IdentNode<
  TName extends string = string,
  TOutputSchema = "unknown"
> extends ASTNode<"identifier", TOutputSchema> {
  name: TName;
}

/**
 * Member-access path node, e.g. `values.password` → path: ["values", "password"].
 * The outputSchema is resolved by walking the (possibly nested) schema.
 */
export interface PathNode<
  TPath extends readonly string[] = readonly string[],
  TOutputSchema = "unknown"
> extends ASTNode<"path", TOutputSchema> {
  path: TPath;
}

export type NumberNode<TValue extends string = string> = ASTNode<
  "literal",
  "number"
> & { raw: TValue; value: ToNumber<TValue> };

/**
 * String literal node. `raw` is the source text between the quotes
 * (escape sequences intact); `value` is the unescaped runtime string.
 * For strings without escapes the two coincide.
 */
export type StringNode<
  TRaw extends string = string,
  TValue extends string = TRaw
> = ASTNode<"literal", "string"> & { raw: TRaw; value: TValue };

export type LiteralNode = NumberNode | StringNode;

export type ConstNode<TValue extends string = string> = ASTNode<
  "const",
  TValue
>;
