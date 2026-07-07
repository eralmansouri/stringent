/**
 * createParser Entry Point (v2)
 *
 * Creates a type-safe parser from node schemas. The returned parser has:
 *   - parse(): parsing of string literals (compile-time literal validation
 *     returns in Phase 3 with the rebuilt type engine)
 *   - safeParse(): runtime parsing of dynamic strings with rich errors
 *   - evaluate() / evaluateAst(): runtime evaluation via node eval() hooks
 *
 * v2 type system: schemas, operand constraints, and result types are
 * ARKTYPE definitions, compiled once per parser in a scope that includes
 * the user's aliases (createParser options.scope) plus arktype's keyword
 * library. Schemas are validated at compile time via type.validate and at
 * runtime by compiling the def; values passed to evaluate() are validated
 * against the schema Type before evaluation.
 */

import type { type, Type } from "arktype";
import type { NodeSchema } from "./schema/index.js";
import type { InferDef } from "./schema/index.js";
import { compileGrammar, type CompiledGrammar } from "./runtime/compile.js";
import type { ScopeAliases } from "./runtime/types.js";
import { isArkErrors } from "./runtime/types.js";
import { parseWithDiagnostics } from "./runtime/parser.js";
import {
  type StringentError,
  StringentParseError,
  toParseError,
  toUnexpectedInputError,
} from "./runtime/diagnostics.js";
import {
  type EvaluationValues,
  EvaluationError,
  evaluateAst,
} from "./runtime/evaluate.js";

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
 * Map a schema def to the shape of its runtime values object.
 *
 * @example
 * InferValues<{ x: "number"; values: { password: "string" } }>
 * // { x: number; values: { password: string } }
 */
export type InferValues<TSchema> = type.infer<TSchema>;

// =============================================================================
// Parser Interface
// =============================================================================

/**
 * Parser interface with type-safe parse methods.
 *
 * Schemas are arktype object defs, validated at compile time by
 * type.validate (a typo'd leaf like { x: "numbr" } errors at the leaf)
 * and compiled at runtime in the parser's scope.
 *
 * TODO(Phase 3): parse()/evaluate() literal-mode input validation and
 * result-type inference return with the rebuilt type-level engine.
 */
export interface Parser<TNodes extends readonly NodeSchema[]> {
  /**
   * Parse a string literal.
   *
   * Throws StringentParseError for invalid input — for runtime-provided
   * strings, use safeParse.
   */
  parse<const TSchema extends object>(
    input: string,
    schema: type.validate<TSchema>
  ): [AnyAstNode, string];

  /**
   * Parse any string (including runtime-provided input).
   *
   * Requires the whole input to be consumed. Never throws for invalid
   * INPUT (returns a structured error with position/expected/found);
   * throws for invalid SCHEMAS (a programmer error).
   */
  safeParse<const TSchema extends object>(
    input: string,
    schema: type.validate<TSchema>
  ): SafeParseResult<AnyAstNode>;

  /**
   * Parse a string and evaluate it against runtime values.
   *
   * Node eval() functions (from defineNode) compute the result. The values
   * object is validated against the schema before evaluation.
   */
  evaluate<const TSchema extends object>(
    input: string,
    schema: type.validate<TSchema>,
    values: type.infer<TSchema>
  ): unknown;

  /**
   * Evaluate an already-parsed AST against runtime values.
   * Use with safeParse for dynamic input.
   */
  evaluateAst<TAst extends { outputSchema: string }>(
    ast: TAst,
    values: EvaluationValues
  ): InferDef<TAst["outputSchema"]>;

  /** The node schemas used to create this parser */
  readonly nodes: TNodes;
}

// =============================================================================
// createParser Factory
// =============================================================================

/**
 * Create a type-safe parser from node schemas.
 *
 * @param nodes - Tuple of node schemas defining the grammar
 * @param options.scope - Extra type aliases available in constraints,
 *   resultTypes, and schemas (e.g. { Money: "number" })
 *
 * @example
 * ```ts
 * const parser = createParser([ternary, add, atoms] as const);
 * const result = parser.safeParse(dynamic, { x: "number" });
 * const sum = parser.evaluate("1+2", {}, {});  // 3
 * ```
 */
export function createParser<const TNodes extends readonly NodeSchema[]>(
  nodes: TNodes,
  options?: { readonly scope?: ScopeAliases }
): Parser<TNodes> {
  const compiled: CompiledGrammar = compileGrammar(nodes, options?.scope);

  const nodesByName = new Map<string, NodeSchema>(
    nodes.map((node) => [node.name, node])
  );

  function compileSchema(schema: object): Type {
    try {
      return compiled.env.compileDef(schema);
    } catch (e) {
      throw new Error(
        `stringent: invalid schema — ${(e as Error).message}. Schema leaves must be type defs resolvable in this parser's scope (add aliases via createParser(nodes, { scope: {...} })).`
      );
    }
  }

  function safeParseImpl(
    input: string,
    schema: object
  ): (SafeParseResult<AnyAstNode> & { rest?: string; schemaType: Type }) {
    const schemaType = compileSchema(schema);
    const { result, diagnostics } = parseWithDiagnostics(
      compiled,
      input,
      schemaType
    );
    if (result.length === 0) {
      return { success: false, error: toParseError(diagnostics), schemaType };
    }
    const [ast, rest] = result;
    if (rest.trim() !== "") {
      return {
        success: false,
        error: toUnexpectedInputError(diagnostics, rest),
        schemaType,
      };
    }
    return { success: true, ast: ast as AnyAstNode, rest, schemaType };
  }

  return {
    parse(input: string, schema: object) {
      const result = safeParseImpl(input, schema);
      if (!result.success) {
        throw new StringentParseError(result.error);
      }
      // Mirror the type-level [node, rest] tuple — rest is "" or trailing
      // whitespace
      return [result.ast, result.rest ?? ""] as never;
    },

    safeParse(input: string, schema: object) {
      const { rest: _rest, schemaType: _t, ...result } = safeParseImpl(
        input,
        schema
      );
      return result as never;
    },

    evaluate(input: string, schema: object, values: EvaluationValues) {
      const result = safeParseImpl(input, schema);
      if (!result.success) {
        throw new StringentParseError(result.error);
      }
      const validated = result.schemaType(values);
      if (isArkErrors(validated)) {
        throw new EvaluationError(
          `values do not match the schema: ${validated.summary}`
        );
      }
      return evaluateAst(result.ast, nodesByName, values) as never;
    },

    evaluateAst(ast: unknown, values: EvaluationValues) {
      return evaluateAst(ast, nodesByName, values) as never;
    },

    nodes,
  } as Parser<TNodes>;
}
