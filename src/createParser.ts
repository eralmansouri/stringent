/**
 * createParser Entry Point
 *
 * Creates a type-safe parser from node schemas. The returned parser has:
 *   - parse(): compile-time validated parsing of string literals
 *   - safeParse(): runtime parsing of dynamic strings with rich errors
 *   - evaluate() / evaluateAst(): runtime evaluation via node eval() hooks
 */

import type { NodeSchema, SchemaToType } from "./schema/index.js";
import type { ComputeGrammar, Grammar } from "./grammar/index.js";
import type { Parse } from "./parse/index.js";
import type { Context, SchemaShape } from "./context.js";
import { parseWithDiagnostics } from "./runtime/parser.js";
import {
  type StringentError,
  StringentParseError,
  toParseError,
  toUnexpectedInputError,
} from "./runtime/diagnostics.js";
import { type EvaluationValues, evaluateAst } from "./runtime/evaluate.js";

// =============================================================================
// Result Types
// =============================================================================

/** Loosely-typed AST node, used when the input is not a string literal */
export type AnyAstNode = { node: string; outputSchema: string } & {
  [key: string]: unknown;
};

/** Result of safeParse: success with AST, or a structured error */
export type SafeParseResult<TAst> =
  | { success: true; ast: TAst }
  | { success: false; error: StringentError };

/**
 * Map a schema to the shape of its runtime values object.
 *
 * @example
 * InferValues<{ x: "number"; values: { password: "string" } }>
 * // { x: number; values: { password: string } }
 */
export type InferValues<TSchema extends SchemaShape> = {
  [K in keyof TSchema]: TSchema[K] extends string
    ? SchemaToType<TSchema[K]>
    : TSchema[K] extends SchemaShape
    ? InferValues<TSchema[K]>
    : never;
};

/** The AST type for a literal input, or AnyAstNode for dynamic strings */
type AstFor<
  TGrammar extends Grammar,
  TInput extends string,
  TSchema extends SchemaShape
> = string extends TInput // dynamic input
  ? AnyAstNode
  : Parse<TGrammar, TInput, Context<TSchema>> extends [infer N, string]
  ? N
  : AnyAstNode;

/** The evaluated result type for a literal input */
type EvaluateResult<
  TGrammar extends Grammar,
  TInput extends string,
  TSchema extends SchemaShape
> = Parse<TGrammar, TInput, Context<TSchema>> extends [
  infer N extends { outputSchema: string },
  string
]
  ? SchemaToType<N["outputSchema"]>
  : unknown;

/**
 * Only accept literal inputs that fully parse against the grammar.
 * Dynamic strings and invalid literals resolve to never — use safeParse
 * for runtime-provided input.
 */
type ValidatedInput<
  TGrammar extends Grammar,
  TInput extends string,
  $ extends Context
> = Parse<TGrammar, TInput, $> extends [any, ""] ? TInput : never;

// =============================================================================
// Parser Interface
// =============================================================================

/**
 * Parser interface with type-safe parse methods.
 *
 * TGrammar: The computed grammar type from node schemas
 * TNodes: The tuple of node schemas
 */
export interface Parser<
  TGrammar extends Grammar,
  TNodes extends readonly NodeSchema[]
> {
  /**
   * Parse a string literal, validated at compile time.
   *
   * The input must be a literal that FULLY parses against the grammar —
   * anything else is a compile-time error. For runtime-provided strings,
   * use safeParse. Throws StringentParseError if the compile-time check
   * was bypassed and the input is invalid.
   *
   * @example
   * ```ts
   * const [ast] = parser.parse("1+2", {});
   * //     ^? { node: "add"; left: ...; right: ... }
   * ```
   */
  parse<TInput extends string, const TSchema extends SchemaShape>(
    input: ValidatedInput<TGrammar, TInput, Context<TSchema>>,
    schema: TSchema
  ): Parse<TGrammar, TInput, Context<TSchema>>;

  /**
   * Parse any string (including runtime-provided input).
   *
   * Requires the whole input to be consumed. Never throws; returns a
   * discriminated result with a structured error (position, expected
   * tokens, found text) on failure.
   *
   * @example
   * ```ts
   * const result = parser.safeParse(userInput, { x: "number" });
   * if (result.success) console.log(result.ast);
   * else console.error(result.error.message);
   * ```
   */
  safeParse<TInput extends string, const TSchema extends SchemaShape>(
    input: TInput,
    schema: TSchema
  ): SafeParseResult<AstFor<TGrammar, TInput, TSchema>>;

  /**
   * Parse a string literal and evaluate it against runtime values.
   *
   * Node eval() functions (from defineNode) compute the result. The values
   * object must match the schema's shape.
   *
   * @example
   * ```ts
   * const result = parser.evaluate("x + 1", { x: "number" }, { x: 2 });
   * //     ^? number (= 3)
   * ```
   */
  evaluate<TInput extends string, const TSchema extends SchemaShape>(
    input: ValidatedInput<TGrammar, TInput, Context<TSchema>>,
    schema: TSchema,
    values: InferValues<TSchema>
  ): EvaluateResult<TGrammar, TInput, TSchema>;

  /**
   * Evaluate an already-parsed AST against runtime values.
   * Use with safeParse for dynamic input:
   *
   * @example
   * ```ts
   * const result = parser.safeParse(userInput, schema);
   * if (result.success) {
   *   const value = parser.evaluateAst(result.ast, values);
   * }
   * ```
   */
  evaluateAst<TAst extends { outputSchema: string }>(
    ast: TAst,
    values: EvaluationValues
  ): SchemaToType<TAst["outputSchema"]>;

  /** The node schemas used to create this parser */
  readonly nodes: TNodes;
}

// =============================================================================
// Grammar Validation
// =============================================================================

function validateNodes(nodes: readonly NodeSchema[]): void {
  const seen = new Set<string>();
  const associativityByPrecedence = new Map<number, "left" | "right">();

  for (const node of nodes) {
    if (seen.has(node.name)) {
      throw new Error(`stringent: duplicate node name '${node.name}'`);
    }
    seen.add(node.name);

    if (node.precedence !== "atom") {
      const prec = node.precedence;
      if (typeof prec !== "number" || !Number.isInteger(prec) || prec < 0) {
        throw new Error(
          `stringent: node '${node.name}' has invalid precedence ${String(
            prec
          )} — precedence must be "atom" or a non-negative integer`
        );
      }

      const assoc = node.associativity ?? "right";
      const existing = associativityByPrecedence.get(prec);
      if (existing !== undefined && existing !== assoc) {
        throw new Error(
          `stringent: nodes at precedence ${prec} mix left and right associativity — associativity is a property of the whole precedence level`
        );
      }
      associativityByPrecedence.set(prec, assoc);

      if (assoc === "left") {
        const first = node.pattern[0];
        const firstIsLhs =
          first !== undefined &&
          first.kind === "expr" &&
          (first as { role?: string }).role === "lhs";
        if (!firstIsLhs || node.pattern.length < 2) {
          throw new Error(
            `stringent: left-associative node '${node.name}' must have a pattern starting with lhs(...) followed by at least one more element`
          );
        }
      }
    }
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
 *
 * @param nodes - Tuple of node schemas defining the grammar
 * @returns Parser instance with parse/safeParse/evaluate methods
 *
 * @example
 * ```ts
 * import { defineNode, number, lhs, rhs, constVal, createParser } from "stringent";
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
 *   pattern: [lhs("number").as("left"), constVal("+"), rhs("number").as("right")],
 *   precedence: 1,
 *   associativity: "left",
 *   resultType: "number",
 *   eval: ({ left, right }) => left + right,
 * });
 *
 * const parser = createParser([numberLit, add] as const);
 *
 * const [ast] = parser.parse("1+2", {});          // compile-time validated
 * const result = parser.safeParse(dynamic, {});    // runtime strings
 * const sum = parser.evaluate("1+2", {}, {});      // 3
 * ```
 */
export function createParser<const TNodes extends readonly NodeSchema[]>(
  nodes: TNodes
): Parser<ComputeGrammar<TNodes>, TNodes> {
  validateNodes(nodes);

  const nodesByName = new Map<string, NodeSchema>(
    nodes.map((node) => [node.name, node])
  );

  function safeParseImpl(
    input: string,
    schema: SchemaShape
  ): SafeParseResult<AnyAstNode> {
    const context: Context = { data: schema };
    const { result, diagnostics } = parseWithDiagnostics(nodes, input, context);
    if (result.length === 0) {
      return { success: false, error: toParseError(diagnostics) };
    }
    const [ast, rest] = result;
    if (rest.trim() !== "") {
      return {
        success: false,
        error: toUnexpectedInputError(diagnostics, rest),
      };
    }
    return { success: true, ast: ast as AnyAstNode };
  }

  return {
    parse(input: string, schema: SchemaShape) {
      const result = safeParseImpl(input, schema);
      if (!result.success) {
        throw new StringentParseError(result.error);
      }
      // Mirror the type-level [node, rest] tuple shape
      return [result.ast, ""] as never;
    },

    safeParse(input: string, schema: SchemaShape) {
      return safeParseImpl(input, schema) as never;
    },

    evaluate(input: string, schema: SchemaShape, values: EvaluationValues) {
      const result = safeParseImpl(input, schema);
      if (!result.success) {
        throw new StringentParseError(result.error);
      }
      return evaluateAst(result.ast, nodesByName, values) as never;
    },

    evaluateAst(ast: unknown, values: EvaluationValues) {
      return evaluateAst(ast, nodesByName, values) as never;
    },

    nodes,
  } as Parser<ComputeGrammar<TNodes>, TNodes>;
}
