/**
 * createParser Entry Point
 *
 * Creates a type-safe parser from node schemas.
 * The returned parser has:
 *   - Type-level parsing via Parse<Grammar, Input, Context>
 *   - Runtime parsing that mirrors the type structure
 *   - Bound evaluator with type-safe data requirements
 */

import type { NodeSchema, SchemaToType } from './schema/index.js';
import type { ComputeGrammar, Grammar } from './grammar/index.js';
import type { Parse } from './parse/index.js';
import type { Context, SchemaRecord, SchemaValue } from './context.js';
import { parse as runtimeParse } from './runtime/parser.js';
import { type, Type } from 'arktype';
import { evaluate } from './runtime/eval.js';

// Re-export schema types for convenience
export type { SchemaValue, SchemaRecord } from './context.js';

// =============================================================================
// Type Utilities for Evaluator
// =============================================================================

/**
 * Extract the outputSchema from an AST node type.
 * Returns the literal schema string if present, otherwise 'unknown'.
 */
type ExtractOutputSchema<T> = T extends { outputSchema: infer S extends string } ? S : 'unknown';

/**
 * Convert a SchemaRecord to its corresponding TypeScript data type.
 * Maps each schema value to its runtime type using arktype.
 *
 * @example
 * type Data = SchemaRecordToData<{ x: 'number'; y: 'string' }>;
 * // { x: number; y: string }
 */
export type SchemaRecordToData<TSchema extends SchemaRecord> = {
  [K in keyof TSchema]: TSchema[K] extends string
    ? SchemaToType<TSchema[K]>
    : TSchema[K] extends SchemaRecord
      ? SchemaRecordToData<TSchema[K]>
      : unknown;
};

// =============================================================================
// Evaluator Types
// =============================================================================

/**
 * A bound evaluator function returned by parser.parse().
 *
 * The evaluator:
 * - Has the nodes pre-bound from the parser
 * - Has the schema captured from the parse call
 * - Requires data that matches the schema types
 * - Returns a value with the type inferred from the AST's outputSchema
 *
 * @typeParam TAST - The parsed AST type
 * @typeParam TSchema - The schema record type
 *
 * @example
 * ```ts
 * const [evaluator, err] = parser.parse('x + 1', { x: 'number' });
 * if (!err) {
 *   const value = evaluator({ x: 5 }); // value is number
 *   const ast = evaluator.ast; // Access the parsed AST
 * }
 * ```
 */
export interface Evaluator<TAST, TSchema extends SchemaRecord> {
  /**
   * Evaluate the parsed expression with the given data.
   *
   * @param data - Variable values matching the schema types
   * @returns The evaluated result with type inferred from outputSchema
   */
  (data: SchemaRecordToData<TSchema>): SchemaToType<ExtractOutputSchema<TAST>>;

  /** The parsed AST */
  readonly ast: TAST;

  /** The schema used during parsing */
  readonly schema: TSchema;
}

/**
 * Result of parsing an expression.
 *
 * Returns a tuple of [evaluator, null] on success, or [null, error] on failure.
 *
 * @typeParam TAST - The parsed AST type
 * @typeParam TSchema - The schema record type
 */
export type ParseResult<TAST, TSchema extends SchemaRecord> =
  | [Evaluator<TAST, TSchema>, null]
  | [null, Error];

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
   * Parse an input string and return a bound evaluator.
   *
   * Schema values are validated at compile time using arktype.
   * Invalid type strings like 'garbage' will cause TypeScript errors.
   *
   * @param input - The input string to parse
   * @param schema - Schema mapping field names to valid arktype type strings or nested object schemas
   * @returns A tuple of [evaluator, null] on success, or [null, error] on failure
   *
   * @example
   * ```ts
   * const [evaluator, err] = parser.parse("x + 1", { x: 'number' });
   * if (!err) {
   *   const value = evaluator({ x: 5 }); // value is number
   *   const ast = evaluator.ast;
   * }
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
  ): ParseResult<ExtractAST<Parse<TGrammar, TInput, Context<TSchema>>>, TSchema>;

  /** The node schemas used to create this parser */
  readonly nodes: TNodes;
}

/**
 * Extract the AST from a Parse result type.
 * Parse returns [AST, remaining] where remaining is '' on success.
 */
type ExtractAST<T> = T extends [infer AST, ''] ? AST : never;

type ValidatedInput<TGrammar extends Grammar, TInput extends string, $ extends Context> =
  Parse<TGrammar, TInput, $> extends [unknown, ''] ? TInput : never;

// =============================================================================
// Runtime Validation
// =============================================================================

/**
 * Cache for arktype validators to avoid re-creating them for each validation.
 */
const validatorCache = new Map<string, Type>();

/**
 * Get or create an arktype validator for a schema.
 */
function getValidator(schema: SchemaValue): Type {
  // For nested objects, create a composite key
  const key = typeof schema === 'string' ? schema : JSON.stringify(schema);

  let validator = validatorCache.get(key);
  if (!validator) {
    validator = type(schema as never) as Type;
    validatorCache.set(key, validator);
  }
  return validator;
}

/**
 * Validate data against a schema at runtime.
 * Throws an error if validation fails.
 */
function validateData(data: unknown, schema: SchemaRecord): void {
  const validator = getValidator(schema);
  const result = validator(data);

  if (result instanceof type.errors) {
    throw new Error(`Data validation failed: ${result.summary}`);
  }
}

// =============================================================================
// createParser Factory
// =============================================================================

/**
 * Create a type-safe parser from node schemas.
 *
 * The returned parser has both:
 * - Compile-time type inference via Parse<Grammar, Input, Context>
 * - Runtime parsing that matches the type structure
 * - Bound evaluator with type-safe data requirements
 *
 * @param nodes - Tuple of node schemas defining the grammar
 * @returns Parser instance with type-safe parse method
 *
 * @example
 * ```ts
 * import { defineNode, number, expr, constVal, createParser } from "stringent";
 *
 * const add = defineNode({
 *   name: "add",
 *   pattern: [lhs("number").as("left"), constVal("+"), rhs("number").as("right")],
 *   precedence: 1,
 *   resultType: "number",
 *   eval: ({ left, right }) => left + right,
 * });
 *
 * const parser = createParser([add] as const);
 *
 * // Type-safe parsing with bound evaluator!
 * const [evaluator, err] = parser.parse("x + 1", { x: 'number' });
 * if (!err) {
 *   const value = evaluator({ x: 5 }); // value is number, equals 6
 *   const ast = evaluator.ast;
 * }
 * ```
 */
export function createParser<const TNodes extends readonly NodeSchema[]>(
  nodes: TNodes
): Parser<ComputeGrammar<TNodes>, TNodes> {
  // Implementation function with explicit typing to avoid deep instantiation
  const parse = <TInput extends string, const TSchema extends SchemaRecord>(
    input: TInput,
    schema: type.validate<TSchema>
  ): ParseResult<ExtractAST<Parse<ComputeGrammar<TNodes>, TInput, Context<TSchema>>>, TSchema> => {
    try {
      // type.validate ensures all string values are valid arktype types
      const context: Context<TSchema> = { data: schema as TSchema };
      const result = runtimeParse(nodes, input, context) as unknown;

      // Check for parse failure (empty result or non-empty remaining)
      if (!Array.isArray(result) || (result as unknown[]).length !== 2) {
        return [null, new Error(`Parse failed: unexpected result format`)];
      }

      const [ast, remaining] = result as [unknown, string];

      if (remaining !== '') {
        return [null, new Error(`Parse failed: unexpected input at '${remaining}'`)];
      }

      // Create the bound evaluator
      const evaluatorFn = (data: SchemaRecordToData<TSchema>) => {
        // Validate data against schema at runtime
        validateData(data, schema as TSchema);

        // Evaluate with the bound nodes - cast for internal use
        // The type system ensures data matches the schema at compile time
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return evaluate(ast, { data, nodes } as any);
      };

      // Create the evaluator object with call signature and properties
      const evaluator = Object.assign(evaluatorFn, {
        ast: ast as ExtractAST<Parse<ComputeGrammar<TNodes>, TInput, Context<TSchema>>>,
        schema: schema as TSchema,
      }) as Evaluator<ExtractAST<Parse<ComputeGrammar<TNodes>, TInput, Context<TSchema>>>, TSchema>;

      return [evaluator, null];
    } catch (error) {
      return [null, error instanceof Error ? error : new Error(String(error))];
    }
  };

  // Return the parser object - cast to avoid deep type checking
  return { parse, nodes } as Parser<ComputeGrammar<TNodes>, TNodes>;
}
