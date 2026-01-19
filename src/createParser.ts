/**
 * createParser Entry Point
 *
 * Creates a type-safe parser from node schemas.
 * The returned parser has:
 *   - Type-level parsing via Parse<Grammar, Input, Context>
 *   - Runtime parsing that mirrors the type structure
 */

import type { NodeSchema } from './schema/index.js';
import type { ComputeGrammar, Grammar } from './grammar/index.js';
import type { Parse } from './parse/index.js';
import type { Context, SchemaRecord } from './context.js';
import { parse as runtimeParse } from './runtime/parser.js';
import { type } from 'arktype';

// Re-export schema types for convenience
export type { SchemaValue, SchemaRecord } from './context.js';

// No separate ValidatedSchema type needed - we use type.validate<TSchema> directly in the signature

// =============================================================================
// Parser Interface
// =============================================================================

/**
 * Parser interface with type-safe parse method.
 *
 * TGrammar: The computed grammar type from node schemas
 * TNodes: The tuple of node schemas
 */
export interface Parser<TGrammar extends Grammar, TNodes extends readonly NodeSchema[]> {
  /**
   * Parse an input string.
   *
   * Schema values are validated at compile time using arktype.
   * Invalid type strings like 'garbage' will cause TypeScript errors.
   *
   * @param input - The input string to parse
   * @param schema - Schema mapping field names to valid arktype type strings or nested object schemas
   * @returns Parse result with computed type
   *
   * @example
   * ```ts
   * const result = parser.parse("1+2", {});
   * // Type: Parse<Grammar, "1+2", Context<{}>>
   * // Value: [{ type: "binary", name: "add", left: {...}, right: {...} }, ""]
   *
   * // Valid schema types:
   * parser.parse("x + 1", { x: 'number' });        // primitive
   * parser.parse("x + 1", { x: 'string.email' });  // subtype
   * parser.parse("x + 1", { x: 'number >= 0' });   // constraint
   * parser.parse("x + 1", { x: 'string | number' }); // union
   *
   * // Nested object schemas:
   * parser.parse("user", { user: { name: 'string', age: 'number' } });
   *
   * // Invalid - causes compile error:
   * // parser.parse("x + 1", { x: 'garbage' });
   * ```
   */
  parse<TInput extends string, const TSchema extends SchemaRecord>(
    input: ValidatedInput<TGrammar, TInput, Context<TSchema>>,
    schema: type.validate<TSchema>
  ): Parse<TGrammar, TInput, Context<TSchema>>;

  /** The node schemas used to create this parser */
  readonly nodes: TNodes;
}

type ValidatedInput<TGrammar extends Grammar, TInput extends string, $ extends Context> =
  Parse<TGrammar, TInput, $> extends [unknown, ''] ? TInput : never;

// =============================================================================
// createParser Factory
// =============================================================================

/**
 * Create a type-safe parser from node schemas.
 *
 * The returned parser has both:
 * - Compile-time type inference via Parse<Grammar, Input, Context>
 * - Runtime parsing that matches the type structure
 *
 * @param nodes - Tuple of node schemas defining the grammar
 * @returns Parser instance with type-safe parse method
 *
 * @example
 * ```ts
 * import { defineNode, number, expr, constVal, createParser } from "stringent";
 *
 * const numberLit = defineNode({
 *   name: "number",
 *   pattern: [number()],
 *   precedence: "atom",
 *   resultType: "number",
 * });
 *
 * const add = defineNode({
 *   name: "add",
 *   pattern: [expr("number"), constVal("+"), expr("number")],
 *   precedence: 1,
 *   resultType: "number",
 * });
 *
 * const parser = createParser([numberLit, add] as const);
 *
 * // Type-safe parsing!
 * const result = parser.parse("1+2", {});
 * // Type: [BinaryNode<"add", NumberNode<"1">, NumberNode<"2">, "number">, ""]
 * ```
 */
export function createParser<const TNodes extends readonly NodeSchema[]>(
  nodes: TNodes
): Parser<ComputeGrammar<TNodes>, TNodes> {
  // Implementation function with explicit typing to avoid deep instantiation
  const parse = <TInput extends string, const TSchema extends SchemaRecord>(
    input: TInput,
    schema: type.validate<TSchema>
  ): Parse<ComputeGrammar<TNodes>, TInput, Context<TSchema>> => {
    // type.validate ensures all string values are valid arktype types
    const context: Context<TSchema> = { data: schema as TSchema };
    const result = runtimeParse(nodes, input, context);
    return result as Parse<ComputeGrammar<TNodes>, TInput, Context<TSchema>>;
  };

  // Return the parser object - cast to avoid deep type checking
  return { parse, nodes } as Parser<ComputeGrammar<TNodes>, TNodes>;
}
