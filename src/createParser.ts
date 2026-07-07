/**
 * createParser Entry Point (v2)
 *
 * Creates a type-safe parser from node schemas. The returned parser has:
 *   - parse(): compile-time validated parsing of string literals
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

import type { scope, type, Type, Out } from "arktype";
import type { NodeSchema } from "./schema/index.js";
import type { InferDef } from "./schema/index.js";
import type { ComputeGrammar, Grammar } from "./grammar/index.js";
import type { InferOfDef, Parse } from "./parse/index.js";
import type { Context, SchemaShape } from "./context.js";
import { compileGrammar, type CompiledGrammar } from "./runtime/compile.js";
import type { ScopeAliases } from "./runtime/types.js";
import { isArkErrors, outputTypeOf } from "./runtime/types.js";
import { parseWithDiagnostics } from "./runtime/parser.js";
import {
  type StringentError,
  StringentParseError,
  toInvalidSchemaError,
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
 * The parser's INFERRED scope: alias name → inferred type, computed by
 * arktype's own scope inferencer (intra-scope references included).
 */
export type InferScope<TScope extends ScopeAliases> = scope.infer<TScope>;

/**
 * Map a schema def to the shape of its runtime values object, resolved
 * in the parser's inferred scope.
 *
 * @example
 * InferValues<{ x: "number"; values: { password: "string" } }>
 * // { x: number; values: { password: string } }
 */
export type InferValues<TSchema, $ = {}> = type.infer<TSchema, $>;

/** The AST type for a literal input, or AnyAstNode for dynamic strings */
type AstFor<
  TGrammar extends Grammar,
  TInput extends string,
  TSchema extends SchemaShape,
  $ extends {} = {}
> = string extends TInput // dynamic input
  ? AnyAstNode
  : Parse<TGrammar, TInput, Context<TSchema, $>> extends [infer N, string]
  ? N
  : AnyAstNode;

/** The evaluated result type for a literal input */
export type EvaluateResult<
  TGrammar extends Grammar,
  TInput extends string,
  TSchema extends SchemaShape,
  $ extends {} = {}
> = Parse<TGrammar, TInput, Context<TSchema, $>> extends [
  infer N extends { outputSchema: unknown },
  string
]
  ? InferOfDef<N["outputSchema"], $>
  : unknown;

/** Options for parser.compile() — predicate-rule error attribution */
export interface CompileRuleOptions {
  /**
   * Field path a predicate failure is attributed to (e.g.
   * ["values", "confirmPassword"]). Defaults to the root path, which
   * surfaces as a form-level error.
   */
  readonly path?: readonly PropertyKey[];
  /** The "expected ..." phrasing of the failure message */
  readonly message?: string;
}

/**
 * The arktype Type produced by parser.compile():
 * - a rule with boolean output is a PREDICATE — the Type validates the
 *   values object and rejects when the rule evaluates false (values in,
 *   values out)
 * - any other rule is a MORPH — values in, evaluated result out
 * - dynamic (non-literal) input: morph to unknown; the runtime decides
 */
export type CompiledRule<
  TGrammar extends Grammar,
  TInput extends string,
  TSchema extends SchemaShape,
  $ extends {} = {}
> = string extends TInput
  ? Type<(In: InferValues<TSchema, $>) => Out<unknown>>
  : EvaluateResult<TGrammar, TInput, TSchema, $> extends infer R
  ? [R] extends [boolean]
    ? Type<InferValues<TSchema, $>>
    : Type<(In: InferValues<TSchema, $>) => Out<R>>
  : never;

type TrimWs<S extends string> = S extends
  | ` ${infer R}`
  | `\t${infer R}`
  | `\n${infer R}`
  | `\r${infer R}`
  ? TrimWs<R>
  : S;

/**
 * Only accept literal inputs that fully parse against the grammar
 * (trailing whitespace allowed, matching safeParse). Dynamic strings and
 * invalid literals resolve to never — use safeParse for runtime input.
 */
export type ValidatedInput<
  TGrammar extends Grammar,
  TInput extends string,
  $ extends Context
> = Parse<TGrammar, TInput, $> extends [unknown, infer R extends string]
  ? TrimWs<R> extends ""
    ? TInput
    : never
  : never;

// =============================================================================
// Parser Interface
// =============================================================================

/**
 * Parser interface with type-safe parse methods.
 *
 * Schemas are arktype object defs, validated at compile time by
 * type.validate IN THE PARSER'S SCOPE — a typo'd leaf like { x: "numbr" }
 * errors at the leaf, while an alias leaf like { created: "Timestamp" }
 * resolves when the parser was created with { scope: { Timestamp: … } }.
 * The same scope drives literal-mode parsing (identifier/path types) and
 * runtime compilation.
 *
 * Schema-leaf validation: safeParse/compile validate leaves eagerly via
 * type.validate. parse/evaluate cannot: with their deferred-conditional
 * input parameter, a validate-wrapped schema sits on TS's instantiation
 * edge and inference becomes METASTABLE — the identical call typechecks
 * or collapses to never depending on declaration order elsewhere in the
 * file (demonstrated; see design-claims.typetest.ts and the V2-PLAN.md
 * gotcha). Bad leaf defs there surface through the input check
 * ("unknown"-typed identifiers fail constrained slots) and at runtime
 * with a precise message.
 */
export interface Parser<
  TGrammar extends Grammar,
  TNodes extends readonly NodeSchema[],
  $ extends {} = {}
> {
  /**
   * Parse a string literal, validated at compile time.
   *
   * The input must be a literal that FULLY parses against the grammar —
   * anything else is a compile-time error. For runtime-provided strings,
   * use safeParse. Throws StringentParseError if the compile-time check
   * was bypassed and the input is invalid.
   */
  parse<TInput extends string, const TSchema extends SchemaShape>(
    input: ValidatedInput<TGrammar, TInput, Context<TSchema, $>>,
    schema: TSchema
  ): Parse<TGrammar, TInput, Context<TSchema, $>>;

  /**
   * Parse any string (including runtime-provided input).
   *
   * Requires the whole input to be consumed. NEVER throws: invalid input
   * returns a structured error with position/expected/found; an invalid
   * schema (a programmer error, normally caught at compile time by
   * type.validate) returns { success: false, error: { code:
   * "INVALID_SCHEMA" } }.
   */
  safeParse<TInput extends string, const TSchema extends SchemaShape>(
    input: TInput,
    schema: type.validate<TSchema, $>
  ): SafeParseResult<AstFor<TGrammar, TInput, TSchema, $>>;

  /**
   * Parse a string literal and evaluate it against runtime values.
   *
   * Node eval() functions (from defineNode) compute the result. The values
   * object is validated against the schema before evaluation.
   */
  evaluate<TInput extends string, const TSchema extends SchemaShape>(
    input: ValidatedInput<TGrammar, TInput, Context<TSchema, $>>,
    schema: TSchema,
    // NoInfer: type.infer as a sibling parameter otherwise poisons the
    // input conditional's generic inference (measured — see V2-PLAN.md)
    values: NoInfer<type.infer<TSchema, $>>
  ): EvaluateResult<TGrammar, TInput, TSchema, $>;

  /**
   * Evaluate an already-parsed AST against runtime values.
   * Use with safeParse for dynamic input.
   */
  evaluateAst<TAst extends { outputSchema: unknown }>(
    ast: TAst,
    values: EvaluationValues
  ): InferOfDef<TAst["outputSchema"], $>;

  /**
   * Compile a rule into an arktype Type (D12) — the ecosystem bridge.
   *
   * A boolean-output rule becomes a PREDICATE Type: it validates the
   * values object against the schema (refinements included), evaluates
   * the rule, and rejects with an ArkErrors entry at `options.path` when
   * the rule is false. Any other rule becomes a MORPH Type: values in,
   * evaluated result out. Either way the result is a real arktype Type —
   * a Standard Schema — so it plugs into react-hook-form, tRPC, hono, …
   * `.in` is the values contract; predicate rules carry a predicate node,
   * so JSON Schema export needs the fallback:
   * `rule.in.toJsonSchema({ fallback: { predicate: (ctx) => ctx.base } })`.
   *
   * Unlike parse/evaluate, dynamic strings ARE accepted (rules often live
   * in config); invalid input throws StringentParseError at compile time
   * — literal inputs additionally get precise compile-time typing.
   */
  compile<TInput extends string, const TSchema extends SchemaShape>(
    input: TInput,
    schema: type.validate<TSchema, $>,
    options?: CompileRuleOptions
  ): CompiledRule<TGrammar, TInput, TSchema, $>;

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
export function createParser<
  const TNodes extends readonly NodeSchema[],
  const TScope extends ScopeAliases = {}
>(
  nodes: TNodes,
  options?: { readonly scope?: TScope }
): Parser<ComputeGrammar<TNodes>, TNodes, InferScope<TScope>> {
  const compiled: CompiledGrammar = compileGrammar(nodes, options?.scope);

  const nodesByName = new Map<string, NodeSchema>(
    nodes.map((node) => [node.name, node])
  );

  type ImplResult =
    | { success: true; ast: AnyAstNode; rest: string; schemaType: Type }
    | { success: false; error: StringentError };

  function safeParseImpl(input: string, schema: object): ImplResult {
    let schemaType: Type;
    try {
      schemaType = compiled.env.compileDef(schema);
    } catch (e) {
      // Schema errors are programmer errors, but safeParse still never
      // throws — they surface as a structured INVALID_SCHEMA result
      // (parse/evaluate/compile turn it into a StringentParseError throw,
      // same as invalid input there)
      return { success: false, error: toInvalidSchemaError(e) };
    }
    const { result, diagnostics } = parseWithDiagnostics(
      compiled,
      input,
      schemaType
    );
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
      const result = safeParseImpl(input, schema);
      return (
        result.success ? { success: true, ast: result.ast } : result
      ) as never;
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

    compile(input: string, schema: object, options?: CompileRuleOptions) {
      const result = safeParseImpl(input, schema);
      if (!result.success) {
        throw new StringentParseError(result.error);
      }
      const { ast, schemaType } = result;

      const outType = outputTypeOf(ast);
      const isPredicate =
        outType !== undefined &&
        compiled.env.isAssignable(outType, compiled.env.compileDef("boolean"));

      if (isPredicate) {
        const expected = options?.message ?? `a value satisfying \`${input}\``;
        const path = [...(options?.path ?? [])];
        return schemaType.narrow(
          (data, ctx) =>
            evaluateAst(ast, nodesByName, data as EvaluationValues) ===
              true ||
            // actual: "" keeps runtime values (possibly secrets) out of messages
            ctx.reject({ expected, actual: "", path: path as never })
        ) as never;
      }

      return schemaType.pipe((data) =>
        evaluateAst(ast, nodesByName, data as EvaluationValues)
      ) as never;
    },

    nodes,
  } as Parser<ComputeGrammar<TNodes>, TNodes, InferScope<TScope>>;
}
