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
import type { Context } from './context.js';
import { parse as runtimeParse } from './runtime/parser.js';
import { type } from 'arktype';

// =============================================================================
// Schema Validation Types
// =============================================================================

/**
 * Validate that all values in a schema record are valid arktype type strings.
 * Each value is validated using arktype's type.validate.
 *
 * Only performs validation when the schema has literal string values.
 * When TSchema values are generic 'string', validation is skipped to avoid
 * deep type instantiation issues.
 *
 * @example
 * ```ts
 * // Valid schema - all values are valid arktype types
 * const schema = { x: 'number', y: 'string.email' } satisfies ValidatedSchema<{ x: 'number', y: 'string.email' }>;
 *
 * // Invalid schema - 'garbage' is not a valid arktype type
 * // Type error: Type '"garbage"' is not assignable to type '"'garbage' is unresolvable"'
 * ```
 */
type ValidatedSchema<TSchema extends Record<string, string>> = {
  [K in keyof TSchema]: string extends TSchema[K]
    ? string // Skip validation for generic string values
    : type.validate<TSchema[K]>; // Validate literal string values
};

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
   * @param schema - Schema mapping field names to valid arktype type strings
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
   * // Invalid - causes compile error:
   * // parser.parse("x + 1", { x: 'garbage' });
   * ```
   */
  parse<TInput extends string, TSchema extends Record<string, string>>(
    input: ValidatedInput<TGrammar, TInput, Context<TSchema>>,
    schema: ValidatedSchema<TSchema>
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
  return {
    parse<TInput extends string, TSchema extends Record<string, string>>(
      input: TInput,
      schema: ValidatedSchema<TSchema>
    ): Parse<ComputeGrammar<TNodes>, TInput, Context<TSchema>> {
      const context: Context<TSchema> = { data: schema as TSchema };
      return runtimeParse(nodes, input, context) as Parse<
        ComputeGrammar<TNodes>,
        TInput,
        Context<TSchema>
      >;
    },
    nodes,
  };
}
