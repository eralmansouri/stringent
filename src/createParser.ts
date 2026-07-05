/**
 * createParser Entry Point
 *
 * Creates a type-safe parser from node schemas. The returned parser has:
 *   - parse(): compile-time validated parsing of string literals
 *   - safeParse(): runtime parsing of dynamic strings with rich errors
 *   - evaluate() / evaluateAst(): runtime evaluation via node eval() hooks
 *
 * The parser derives a closed TYPE VOCABULARY from the grammar (every
 * static resultType, the built-in element types, plus createParser's
 * `types` option). Constraint strings are validated against it at
 * construction; schema leaves are validated against it at compile time
 * (via the SchemaShapeOf bound) and at runtime (safeParse walks the
 * schema). This closes the "any string is a type" hole.
 */

import {
  type NodeSchema,
  type SchemaToType,
  type ExprSchema,
  type PatternSchema,
  isFromBinding,
  isSameAs,
} from "./schema/index.js";
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
import {
  type EvaluationValues,
  RESERVED_NODE_NAMES,
  evaluateAst,
} from "./runtime/evaluate.js";

// =============================================================================
// Type Vocabulary
// =============================================================================

/** Output types of the built-in pattern elements */
type BuiltinTypeName = "number" | "string" | "boolean" | "unknown";

const BUILTIN_TYPE_NAMES: readonly BuiltinTypeName[] = [
  "number",
  "string",
  "boolean",
  "unknown",
];

/**
 * The closed set of type names a grammar knows about: every static
 * resultType, the built-ins, and any extra `types` passed to createParser.
 */
export type VocabOf<
  TNodes extends readonly NodeSchema[],
  TExtra extends readonly string[]
> =
  | Extract<NonNullable<TNodes[number]["resultType"]>, string>
  | BuiltinTypeName
  | TExtra[number];

/** A schema whose leaves are restricted to a known type vocabulary */
export type SchemaShapeOf<TVocab extends string> = {
  readonly [key: string]: TVocab | SchemaShapeOf<TVocab>;
};

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

/** Trim leading whitespace from a string type. */
export type TrimWs<S extends string> = S extends
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
type ValidatedInput<
  TGrammar extends Grammar,
  TInput extends string,
  $ extends Context
> = Parse<TGrammar, TInput, $> extends [any, infer R extends string]
  ? TrimWs<R> extends ""
    ? TInput
    : never
  : never;

/**
 * TInput when it FULLY parses against the grammar in the given context
 * (trailing whitespace allowed), otherwise never.
 *
 * The public form of the check parse() applies to its input parameter.
 * Use it to validate expression string literals embedded inside larger
 * `as const` structures — e.g. a form definition whose fields carry
 * `{ $expr: string }` slots — without calling a function.
 */
export type ValidExpression<
  TGrammar extends Grammar,
  TInput extends string,
  $ extends Context = Context<{}>
> = ValidatedInput<TGrammar, TInput, $>;

/**
 * The root node of a fully-parsed expression literal, or never.
 *
 * Like ValidExpression, but yields the parsed AST node type (carrying
 * `outputSchema`, bindings, etc.) instead of echoing the input.
 */
export type ParsedExpression<
  TGrammar extends Grammar,
  TInput extends string,
  $ extends Context = Context<{}>
> = Parse<TGrammar, TInput, $> extends [infer N, infer R extends string]
  ? TrimWs<R> extends ""
    ? N
    : never
  : never;

/**
 * The result-type NAME of a fully-parsed expression literal, or never.
 *
 * @example
 * ExpressionResult<G, "1 == 2", Context<{}>>  // "boolean"
 * ExpressionResult<G, "1 + 2", Context<{}>>   // "number"
 * ExpressionResult<G, "1 +", Context<{}>>     // never
 *
 * Consumers gate expression slots on this, e.g.
 * `ExpressionResult<G, S, $> extends "boolean" ? S : ErrorMessage`.
 */
export type ExpressionResult<
  TGrammar extends Grammar,
  TInput extends string,
  $ extends Context = Context<{}>
> = ResultNameOf<ParsedExpression<TGrammar, TInput, $>>;

/** outputSchema of a node, with an explicit never guard (never is the
 *  bottom type, so a bare `never extends { outputSchema: ... }` would take
 *  the true branch and infer O as its `string` constraint). */
type ResultNameOf<N> = [N] extends [never]
  ? never
  : N extends { outputSchema: infer O extends string }
  ? O
  : never;

// =============================================================================
// Parser Interface
// =============================================================================

/**
 * Parser interface with type-safe parse methods.
 *
 * TGrammar: The computed grammar type from node schemas
 * TNodes: The tuple of node schemas
 * TVocab: The grammar's closed type-name vocabulary (schema leaves are
 *         checked against it at compile time)
 */
export interface Parser<
  TGrammar extends Grammar,
  TNodes extends readonly NodeSchema[],
  TVocab extends string = string
> {
  /**
   * Parse a string literal, validated at compile time.
   *
   * The input must be a literal that FULLY parses against the grammar —
   * anything else is a compile-time error. For runtime-provided strings,
   * use safeParse. Throws StringentParseError if the compile-time check
   * was bypassed and the input is invalid.
   */
  parse<TInput extends string, const TSchema extends SchemaShapeOf<TVocab>>(
    input: ValidatedInput<TGrammar, TInput, Context<TSchema>>,
    schema: TSchema
  ): Parse<TGrammar, TInput, Context<TSchema>>;

  /**
   * Parse any string (including runtime-provided input).
   *
   * Requires the whole input to be consumed. Never throws for invalid
   * INPUT (returns a structured error with position/expected/found);
   * throws for invalid SCHEMAS (unknown type names — a programmer error).
   */
  safeParse<TInput extends string, const TSchema extends SchemaShapeOf<TVocab>>(
    input: TInput,
    schema: TSchema
  ): SafeParseResult<AstFor<TGrammar, TInput, TSchema>>;

  /**
   * Parse a string literal and evaluate it against runtime values.
   *
   * Node eval() functions (from defineNode) compute the result. The values
   * object must match the schema's shape.
   */
  evaluate<TInput extends string, const TSchema extends SchemaShapeOf<TVocab>>(
    input: ValidatedInput<TGrammar, TInput, Context<TSchema>>,
    schema: TSchema,
    values: InferValues<TSchema>
  ): EvaluateResult<TGrammar, TInput, TSchema>;

  /**
   * Evaluate an already-parsed AST against runtime values.
   * Use with safeParse for dynamic input.
   */
  evaluateAst<TAst extends { outputSchema: string }>(
    ast: TAst,
    values: EvaluationValues
  ): SchemaToType<TAst["outputSchema"]>;

  /** The node schemas used to create this parser */
  readonly nodes: TNodes;

  /** The grammar's type-name vocabulary (resultTypes + built-ins + extras) */
  readonly typeNames: ReadonlySet<string>;
}

// =============================================================================
// Grammar Validation
// =============================================================================

const CONSUMING_KINDS = new Set(["number", "string", "ident", "path", "const"]);

function isNamed(element: PatternSchema): element is PatternSchema & {
  name: string;
} {
  return "__named" in element && element.__named === true;
}

function checkConstraintVocabulary(
  nodeName: string,
  element: ExprSchema,
  vocab: ReadonlySet<string>
): void {
  const spec = element.constraint;
  if (spec === undefined || isSameAs(spec)) return;
  const names = typeof spec === "string" ? [spec] : spec;
  if (names.length === 0) {
    throw new Error(
      `stringent: node '${nodeName}' has an empty constraint list — the slot could never match anything`
    );
  }
  for (const name of names) {
    if (!vocab.has(name)) {
      throw new Error(
        `stringent: node '${nodeName}' has constraint '${name}' which matches no known type — known types: ${[...vocab].sort().join(", ")}`
      );
    }
  }
}

/** Binding names that would collide with AST node structure or JS proto
 *  setter semantics */
const RESERVED_BINDING_NAMES = new Set(["node", "outputSchema", "__proto__"]);

function validateNodes(
  nodes: readonly NodeSchema[],
  vocab: ReadonlySet<string>
): void {
  const seen = new Set<string>();
  const associativityByPrecedence = new Map<number, "left" | "right">();

  for (const node of nodes) {
    if (seen.has(node.name)) {
      throw new Error(`stringent: duplicate node name '${node.name}'`);
    }
    if (RESERVED_NODE_NAMES.has(node.name)) {
      throw new Error(
        `stringent: node name '${node.name}' is reserved (used by the parser's primitive nodes)`
      );
    }
    seen.add(node.name);

    if (node.pattern.length === 0) {
      throw new Error(`stringent: node '${node.name}' has an empty pattern`);
    }

    // --- Position 0: must consume input or descend strictly ---------------
    const first = node.pattern[0];
    if (first.kind === "expr") {
      const role = (first as ExprSchema).role;
      if (node.precedence === "atom") {
        throw new Error(
          `stringent: atom '${node.name}' cannot start with an expression element — atoms must start with a consuming element (number, string, ident, path, const)`
        );
      }
      if (role !== "lhs") {
        throw new Error(
          `stringent: node '${node.name}' starts with ${role}(...), which would recurse into the same level forever — operator patterns must start with lhs(...) or a consuming element`
        );
      }
      const spec = (first as ExprSchema).constraint;
      if (isSameAs(spec)) {
        throw new Error(
          `stringent: node '${node.name}' uses sameAs(...) on its first element — there is no earlier operand to reference`
        );
      }
    }

    // --- Per-element checks -----------------------------------------------
    const namedSoFar = new Map<string, PatternSchema>();
    const allNamed = new Map<string, PatternSchema>();
    for (const element of node.pattern) {
      if (isNamed(element)) allNamed.set(element.name, element);
    }
    let hasNamed = false;

    for (const element of node.pattern) {
      if (element.kind === "const" && (element as { value: string }).value === "") {
        throw new Error(
          `stringent: node '${node.name}' uses constVal("") — empty constants match zero width and cannot terminate`
        );
      }
      if (element.kind === "expr") {
        checkConstraintVocabulary(node.name, element as ExprSchema, vocab);
        const spec = (element as ExprSchema).constraint;
        if (isSameAs(spec)) {
          const target = namedSoFar.get(spec.binding);
          if (target === undefined) {
            throw new Error(
              `stringent: node '${node.name}' uses sameAs('${spec.binding}') but no earlier element is named '${spec.binding}'`
            );
          }
          if (target.kind === "const") {
            throw new Error(
              `stringent: node '${node.name}' uses sameAs('${spec.binding}') on a const element — const bindings carry their matched text as their type, which no expression can produce`
            );
          }
        }
      }
      if (isNamed(element)) {
        if (RESERVED_BINDING_NAMES.has(element.name)) {
          throw new Error(
            `stringent: node '${node.name}' uses the binding name '${element.name}', which would collide with the AST node structure`
          );
        }
        if (namedSoFar.has(element.name)) {
          throw new Error(
            `stringent: node '${node.name}' binds the name '${element.name}' twice — binding names must be unique within a pattern`
          );
        }
        namedSoFar.set(element.name, element);
        hasNamed = true;
      }
    }

    // --- Result type --------------------------------------------------------
    const isPassthrough =
      !hasNamed && node.pattern.length === 1 && node.pattern[0].kind !== "const";
    const resultSpec = node.resultType;
    if (isFromBinding(resultSpec)) {
      const target = allNamed.get(resultSpec.binding);
      if (target === undefined) {
        throw new Error(
          `stringent: node '${node.name}' uses fromBinding('${resultSpec.binding}') but no element is named '${resultSpec.binding}'`
        );
      }
      if (target.kind === "const") {
        throw new Error(
          `stringent: node '${node.name}' uses fromBinding('${resultSpec.binding}') on a const element — const bindings carry their matched text as their type, which would escape the type vocabulary`
        );
      }
    }
    if (!isPassthrough && resultSpec === undefined) {
      throw new Error(
        `stringent: node '${node.name}' needs a resultType (a type name or fromBinding(...)) — only single-element passthrough patterns can omit it`
      );
    }
    if (typeof resultSpec === "string" && !vocab.has(resultSpec)) {
      // Static resultTypes are part of the vocabulary by construction, so
      // this only triggers for exotic cases (e.g. proxied node objects).
      throw new Error(
        `stringent: node '${node.name}' has resultType '${resultSpec}' which is not in the vocabulary`
      );
    }

    // --- Precedence & associativity ----------------------------------------
    if (node.precedence !== "atom") {
      const prec = node.precedence;
      if (
        typeof prec !== "number" ||
        !Number.isSafeInteger(prec) ||
        prec < 0
      ) {
        throw new Error(
          `stringent: node '${node.name}' has invalid precedence ${String(
            prec
          )} — precedence must be "atom" or a non-negative safe integer`
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
        const firstIsLhs =
          first.kind === "expr" && (first as ExprSchema).role === "lhs";
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
// Schema Validation (runtime)
// =============================================================================

function validateSchema(
  schema: SchemaShape,
  vocab: ReadonlySet<string>,
  pathPrefix = ""
): void {
  for (const key of Object.keys(schema)) {
    const value = schema[key];
    const keyPath = pathPrefix === "" ? key : `${pathPrefix}.${key}`;
    if (typeof value === "string") {
      if (!vocab.has(value)) {
        throw new Error(
          `stringent: schema key '${keyPath}' has unknown type '${value}' — known types: ${[...vocab].sort().join(", ")}. Add custom type names via createParser(nodes, { types: [...] }).`
        );
      }
    } else if (value !== null && typeof value === "object") {
      validateSchema(value, vocab, keyPath);
    } else {
      throw new Error(
        `stringent: schema key '${keyPath}' must be a type name or a nested schema, got ${typeof value}`
      );
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
 * @param options.types - Extra type names to allow in schemas/constraints
 *   beyond the grammar's own resultTypes (e.g. ["date"])
 *
 * @example
 * ```ts
 * const parser = createParser([numberLit, variable, ternary, add] as const);
 * const [ast] = parser.parse("1+2", {});           // compile-time validated
 * const result = parser.safeParse(dynamic, {});     // runtime strings
 * const sum = parser.evaluate("1+2", {}, {});       // 3
 * ```
 */
export function createParser<
  const TNodes extends readonly NodeSchema[],
  const TExtra extends readonly string[] = readonly []
>(
  nodes: TNodes,
  options?: { readonly types?: TExtra }
): Parser<ComputeGrammar<TNodes>, TNodes, VocabOf<TNodes, TExtra>> {
  const vocab = new Set<string>(BUILTIN_TYPE_NAMES);
  for (const node of nodes) {
    if (typeof node.resultType === "string") vocab.add(node.resultType);
  }
  for (const extra of options?.types ?? []) vocab.add(extra);

  validateNodes(nodes, vocab);

  const nodesByName = new Map<string, NodeSchema>(
    nodes.map((node) => [node.name, node])
  );

  function safeParseImpl(
    input: string,
    schema: SchemaShape
  ): SafeParseResult<AnyAstNode> & { rest?: string } {
    validateSchema(schema, vocab);
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
    return { success: true, ast: ast as AnyAstNode, rest };
  }

  return {
    parse(input: string, schema: SchemaShape) {
      const result = safeParseImpl(input, schema);
      if (!result.success) {
        throw new StringentParseError(result.error);
      }
      // Mirror the type-level [node, rest] tuple — rest is "" or trailing
      // whitespace, exactly as Parse<> computes it
      return [result.ast, result.rest ?? ""] as never;
    },

    safeParse(input: string, schema: SchemaShape) {
      const { rest: _rest, ...result } = safeParseImpl(input, schema);
      return result as never;
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
    typeNames: vocab,
  } as Parser<ComputeGrammar<TNodes>, TNodes, VocabOf<TNodes, TExtra>>;
}
