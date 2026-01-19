/**
 * createParser Entry Point
 *
 * Creates a type-safe parser from node schemas.
 * The returned parser has:
 *   - Type-level parsing via Parse<Grammar, Input, Context>
 *   - Runtime parsing that mirrors the type structure
 */

import type { NodeSchema } from "./schema/index.js";
import type { ComputeGrammar, Grammar } from "./grammar/index.js";
import type { Parse } from "./parse/index.js";
import type { Context } from "./context.js";
import { parse as runtimeParse } from "./runtime/parser.js";

// =============================================================================
// Parser Interface
// =============================================================================

/**
 * Parser interface with type-safe parse method.
 *
 * TGrammar: The computed grammar type from node schemas
 * TNodes: The tuple of node schemas
 */
export interface Parser<
  TGrammar extends Grammar,
  TNodes extends readonly NodeSchema[]
> {
  /**
   * Parse an input string.
   *
   * @param input - The input string to parse
   * @param schema - Schema mapping field names to their types
   * @returns Parse result with computed type
   *
   * @example
   * ```ts
   * const result = parser.parse("1+2", {});
   * // Type: Parse<Grammar, "1+2", Context<{}>>
   * // Value: [{ type: "binary", name: "add", left: {...}, right: {...} }, ""]
   * ```
   */
  parse<TInput extends string, TSchema extends Record<string, string>>(
    input: ValidatedInput<TGrammar, TInput, Context<TSchema>>,
    schema: TSchema
  ): Parse<TGrammar, TInput, Context<TSchema>>;

  /** The node schemas used to create this parser */
  readonly nodes: TNodes;
}

type ValidatedInput<
  TGrammar extends Grammar,
  TInput extends string,
  $ extends Context
> = Parse<TGrammar, TInput, $> extends [any, ""] ? TInput : never;

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
      schema: TSchema
    ): Parse<ComputeGrammar<TNodes>, TInput, Context<TSchema>> {
      const context: Context<TSchema> = { data: schema };
      return runtimeParse(nodes, input, context) as Parse<
        ComputeGrammar<TNodes>,
        TInput,
        Context<TSchema>
      >;
    },
    nodes,
  };
}
