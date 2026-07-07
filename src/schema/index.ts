/**
 * Schema Types (v2)
 *
 * Pattern element schemas for defineNode. These are pure type descriptors
 * that preserve literal types for compile-time grammar computation.
 *
 * v2 type system: operand constraints and result types are ARKTYPE
 * definitions. A constraint string that names an earlier binding in the
 * same pattern is a BINDING REFERENCE ("assignable to whatever that
 * operand parsed as"); anything else is compiled as an arktype def in the
 * parser's scope. resultType follows the same rule and may also be an
 * object def for nodes producing structured values.
 *
 * Every semantic construct (constraints, result derivation, associativity)
 * is declarative DATA so the type-level and runtime engines can interpret
 * it identically. This is why result types cannot be inferred from eval's
 * TypeScript return type: types drive parsing (backtracking) in BOTH
 * engines, and the runtime engine cannot see TypeScript types.
 *
 * Associativity is derived from the pattern's tail shape:
 * - tail parses at the CURRENT level (rest)  → right-associative
 * - tail parses at a TIGHTER level (operand)    → left-associative (fold)
 * - expr() is for delimited slots only and must be followed by a constVal
 */

import type { type } from "arktype";
import type {
  NumberNode,
  StringNode,
  IdentNode,
  PathNode,
  ConstNode,
} from "../primitive/index.js";

// =============================================================================
// Pattern Element Schemas
// =============================================================================
export interface Schema<TKind extends string> {
  readonly kind: TKind;
}

/** Number literal pattern element */
export interface NumberSchema extends Schema<"number"> {}

/** String literal pattern element */
export interface StringSchema<
  TQuotes extends readonly string[] = readonly string[]
> extends Schema<"string"> {
  readonly quotes: TQuotes;
}

/** Identifier pattern element (single segment, no dots) */
export interface IdentSchema extends Schema<"ident"> {}

/** Member-access path pattern element: matches `ident(.ident)*` */
export interface PathSchema extends Schema<"path"> {}

/** Constant (exact match) pattern element */
export interface ConstSchema<TValue extends string = string>
  extends Schema<"const"> {
  readonly value: TValue;
}

// =============================================================================
// Constraints & Result Types
// =============================================================================

/**
 * Symmetric constraint for equality-style operators: satisfied when the
 * operand's type OVERLAPS the referenced binding's type (some value could
 * inhabit both), rather than being a subtype of it. `x == 1` and `1 == x`
 * both parse for x: "string | number"; "a" == 1 still fails (disjoint).
 */
export interface OverlapsRef<TBinding extends string = string> {
  readonly kind: "overlaps";
  readonly binding: TBinding;
}

/** Create a symmetric (overlap) constraint referencing an earlier binding */
export const overlapping = <const TBinding extends string>(
  binding: TBinding
): OverlapsRef<TBinding> => ({ kind: "overlaps", binding });

/** Runtime type guard for the overlapping() marker */
export function isOverlapsRef(value: unknown): value is OverlapsRef {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { kind?: unknown }).kind === "overlaps"
  );
}

/**
 * A constraint on an expression slot:
 * - a string naming an EARLIER binding in the same pattern — "assignable
 *   to whatever that operand parsed as" (e.g. rest("left"))
 * - any other string — an arktype definition compiled in the parser's
 *   scope (e.g. operand("number"), operand("string | number"), operand("string.email"))
 * - a def EMBEDDING earlier binding names (e.g. rest("left | null")) —
 *   resolved per-parse in a scope extended with the parsed operand types
 * - overlapping("left") — symmetric: types must overlap, not nest
 *
 * createParser decides string interpretation: binding names shadow nothing
 * because a binding name that is also a resolvable def is a construction
 * error.
 */
export type ConstraintSpec = string | OverlapsRef;

/**
 * A node's result type:
 * - the name of a binding — the node's type is whatever that operand
 *   parsed as (polymorphic passthrough, e.g. resultType: "then")
 * - an arktype string def (e.g. "boolean")
 * - an arktype object def (e.g. { min: "number", max: "number" })
 * - a def EMBEDDING binding names (e.g. "then | null", { value: "acc" }) —
 *   resolved per-parse in a scope extended with the parsed operand types
 *
 * Required for every node that CONSTRUCTS a result. The only exemption is
 * a single-element passthrough pattern (e.g. [number()]), which forwards
 * its child unchanged and therefore has nothing to declare.
 */
export type ResultSpec = string | object;

/** Expression role determines which grammar level is used */
export type ExprRole = "operand" | "rest" | "expr";

/** Recursive expression pattern element with optional constraint and role */
export interface ExprSchema<
  TConstraint extends ConstraintSpec | undefined = ConstraintSpec | undefined,
  TRole extends ExprRole = ExprRole
> extends Schema<"expr"> {
  readonly constraint?: TConstraint;
  readonly role: TRole;
}

/** Base pattern schema type (without NamedSchema to avoid circular reference) */
export type PatternSchemaBase =
  | NumberSchema
  | StringSchema<readonly string[]>
  | IdentSchema
  | PathSchema
  | ConstSchema<string>
  | ExprSchema;

// =============================================================================
// Named Schema (for .as() bindings)
// =============================================================================

/**
 * A pattern schema with a binding name.
 * Created by calling .as(name) on any pattern element.
 *
 * Uses intersection so schema properties remain accessible without unwrapping.
 *
 * @example
 * operand("number").as("left")  // ExprSchema<"number", "operand"> & { __named: true; name: "left" }
 */
export type NamedSchema<
  TSchema extends PatternSchemaBase = PatternSchemaBase,
  TName extends string = string
> = TSchema & {
  readonly __named: true;
  readonly name: TName;
};

/** Union of all pattern element schemas (including named) */
export type PatternSchema = PatternSchemaBase | NamedSchema;

// =============================================================================
// Pattern Builder
// =============================================================================
//
// Patterns are authored through a FLUENT BUILDER so every arktype def the
// user writes is validated where it is written, against the bindings
// accumulated so far in the chain (the same idiom as arktype's own
// fluent APIs). `operand("nmbr")` is a compile error AT that call;
// `operand("left")` and `rest("left | null")` compile because `left` is
// in the chain's scope. `.result()` and `.eval()` live IN the chain too:
// a pattern-dependent sibling property in the defineNode config makes
// TypeScript's tuple inference order-sensitive (measured — pinned in
// design-claims.typetest.ts "builder inference"), while chain methods
// see the pattern's types locally and are order-robust by construction.
//
// The builder is a construction-and-validation device ONLY: what it
// produces — and what NodeSchema stores — is the same declarative
// pattern tuple both engines interpret (semantics stay data).

/** Binding names that would collide with AST node structure or JS proto
 *  setter semantics (compile-time twin of the createParser check). */
type ReservedBindingName = "node" | "outputSchema" | "__proto__";

/** The chain's accumulated binding scope: binding name → `unknown`
 *  (references validate structurally; their concrete types are resolved
 *  per parse). Const bindings are EXCLUDED — they carry matched text,
 *  not a type, so constraints and result defs may not reference them
 *  (mirrors the runtime's template classification). */
type BindingScope = Record<string, unknown>;

/** Binding names already used anywhere in the pattern (const bindings
 *  included) — for duplicate detection in `.as()`. */
type UsedNames<TPattern extends readonly PatternSchema[]> =
  ExtractNamedSchemas<TPattern>["name"];

/** Validate an overlapping() target: it must name an earlier non-const
 *  binding in the chain. */
type ValidateOverlapsTarget<
  B extends string,
  $ extends BindingScope
> = B extends keyof $
  ? B
  : `overlapping('${B}') must reference an earlier non-const binding`;

/**
 * Validate a binding name: not a duplicate, not reserved, and not itself
 * a resolvable type (a binding name that is also a def would be
 * ambiguous — the compile-time twin of the construction-time rule).
 */
type ValidateBindingName<
  TName extends string,
  TPattern extends readonly PatternSchema[]
> = TName extends UsedNames<TPattern>
  ? `binding '${TName}' is already used in this pattern`
  : TName extends ReservedBindingName
  ? `binding '${TName}' would collide with AST node structure`
  : [type.validate<TName>] extends [never]
  ? // FAIL OPEN on a collapsed validate: under a tight instantiation
    // budget (editor tsserver, older TS) arktype's validate can degrade
    // to never, and [never] extends [TName] is true — without this guard
    // that surfaced as a spurious "shadows a resolvable type" error on
    // perfectly good names. The construction-time check remains the
    // authority for real shadowing.
    TName
  : [type.validate<TName>] extends [TName]
  ? `binding '${TName}' shadows a resolvable type — pick a name that is not a type`
  : TName;

/** How a named element extends the constraint scope: const bindings
 *  carry text, not a type — they never enter the scope. */
type ScopeAdd<
  TElement extends PatternSchemaBase,
  TName extends string,
  $ extends BindingScope
> = TElement extends ConstSchema ? $ : $ & { [K in TName]: unknown };

/**
 * The pattern builder. Each element method appends one element and
 * returns a builder whose LAST element can be named with `.as()`;
 * `.result()` (trailing) declares the node's result type, after which
 * `.eval()` attaches an evaluation function checked against it.
 *
 * The `"~"`-prefixed properties carry the accumulated state for
 * defineNode's inference — they are internal.
 */
export interface PatternBuilder<
  TPattern extends readonly PatternSchema[] = readonly [],
  $ extends BindingScope = {}
> {
  readonly "~pattern": TPattern;
  readonly "~resultType": undefined;
  readonly "~eval": undefined;

  /** Append a number literal element */
  number(): NameableBuilder<TPattern, $, NumberSchema>;

  /** Append a string literal element, e.g. `p.string(['"', "'"])` —
   *  escapes are processed */
  string<const TQuotes extends readonly string[]>(
    quotes: TQuotes
  ): NameableBuilder<TPattern, $, StringSchema<TQuotes>>;

  /** Append an identifier element (single segment, no dots) */
  ident(): NameableBuilder<TPattern, $, IdentSchema>;

  /** Append a member-access path element: matches `ident(.ident)*`
   *  (e.g. `values.password`), type resolved by walking the schema.
   *  Whitespace around the dots is not allowed. */
  path(): NameableBuilder<TPattern, $, PathSchema>;

  /**
   * Append a constant element. IDENTIFIER-LIKE values
   * (`constVal("null")`, `constVal("and")`) match only as a WHOLE
   * identifier — `nullable` or `andy` never match (word-boundary rule;
   * pinned in design-claims). Other values (`"+"`, `"=="`) match as raw
   * text. Keyword literals are ordinary const-pattern nodes:
   *
   * @example
   * const nullLit = defineNode({
   *   name: "null",
   *   precedence: 5,
   *   pattern: (p) => p.constVal("null").result("null").eval(() => null),
   * });
   */
  constVal<const TValue extends string>(
    value: TValue
  ): NameableBuilder<TPattern, $, ConstSchema<TValue>>;

  /**
   * Append a TIGHTER-LEVEL expression element.
   *
   * Parses at the next-higher grammar level, avoiding left-recursion.
   * A pattern whose final operand is operand() makes its level
   * LEFT-associative (the engine folds repetitions: `a-b-c` → `(a-b)-c`).
   *
   * Constraint forms: operand("number"), operand("string | number"),
   * operand("left") (a binding reference — not valid at position 0,
   * where no earlier operand exists), operand().
   */
  operand(): NameableBuilder<TPattern, $, ExprSchema<undefined, "operand">>;
  operand<const C extends string>(
    constraint: type.validate<C, $>
  ): NameableBuilder<TPattern, $, ExprSchema<C, "operand">>;
  operand<const B extends string>(
    constraint: OverlapsRef<ValidateOverlapsTarget<B, $>>
  ): NameableBuilder<TPattern, $, ExprSchema<OverlapsRef<B>, "operand">>;

  /**
   * Append a CURRENT-LEVEL expression element.
   *
   * Parses at the same level. A pattern whose final operand is rest()
   * makes its level RIGHT-associative (`a ^ b ^ c` → `a ^ (b ^ c)`).
   *
   * Constraint forms: rest("number"), rest("left"), rest("left | null"),
   * rest(overlapping("left")), rest().
   */
  rest(): NameableBuilder<TPattern, $, ExprSchema<undefined, "rest">>;
  rest<const C extends string>(
    constraint: type.validate<C, $>
  ): NameableBuilder<TPattern, $, ExprSchema<C, "rest">>;
  rest<const B extends string>(
    constraint: OverlapsRef<ValidateOverlapsTarget<B, $>>
  ): NameableBuilder<TPattern, $, ExprSchema<OverlapsRef<B>, "rest">>;

  /**
   * Append a FULL expression element.
   *
   * Resets to the full grammar (precedence 0). Only for DELIMITED
   * contexts — every expr() must be followed by at least one constVal in
   * the same pattern (parentheses' ")", ternary's ":"), otherwise it
   * would swallow looser operators and break precedence.
   */
  expr(): NameableBuilder<TPattern, $, ExprSchema<undefined, "expr">>;
  expr<const C extends string>(
    constraint: type.validate<C, $>
  ): NameableBuilder<TPattern, $, ExprSchema<C, "expr">>;
  expr<const B extends string>(
    constraint: OverlapsRef<ValidateOverlapsTarget<B, $>>
  ): NameableBuilder<TPattern, $, ExprSchema<OverlapsRef<B>, "expr">>;

  /**
   * Declare the node's result type (trailing — after the last element):
   * - a binding name ("then") — derived per-parse from that operand
   * - an arktype def ("boolean", { min: "number", max: "number" }) —
   *   the node mints a type; defs may EMBED binding references
   *   ("then | null"), resolved per-parse
   *
   * Validated by arktype with the chain's bindings in scope. Required
   * for every node that CONSTRUCTS a result; only a single-element
   * passthrough pattern omits it. (The "~resolved" key is reserved —
   * enforced at construction.)
   */
  result<const R extends ResultSpec>(
    def: type.validate<R, $>
  ): ResultedBuilder<TPattern, R>;
}

/** Builder state right after appending an element: chain the next
 *  element directly, or name this one with `.as()` first. */
export interface NameableBuilder<
  TPattern extends readonly PatternSchema[],
  $ extends BindingScope,
  TElement extends PatternSchemaBase
> extends PatternBuilder<readonly [...TPattern, TElement], $> {
  /** Name the element just appended: it becomes a binding — a field on
   *  the AST node, a typed thunk in eval's parameter, and (for non-const
   *  elements) a scope alias for later constraints and the result def. */
  as<const TName extends string>(
    name: ValidateBindingName<TName, TPattern>
  ): PatternBuilder<
    readonly [...TPattern, NamedSchema<TElement, TName>],
    ScopeAdd<TElement, TName, $>
  >;
}

/** Builder state after `.result()`: optionally attach `.eval()` —
 *  its return type is checked against the declared result. */
export interface ResultedBuilder<
  TPattern extends readonly PatternSchema[],
  TResultType extends ResultSpec
> {
  readonly "~pattern": TPattern;
  readonly "~resultType": TResultType;
  readonly "~eval": undefined;

  /**
   * Attach the node's evaluation function. Bindings arrive as MEMOIZED
   * THUNKS (evaluation is uniformly lazy — call a binding to evaluate
   * it; untaken branches never run). The return type is checked against
   * the declared result.
   */
  eval(
    fn: (
      bindings: Thunked<InferEvaluatedBindings<TPattern>>
    ) => EvalReturn<TResultType, TPattern>
  ): EvaledBuilder<TPattern, TResultType>;
}

/** Terminal builder state: pattern + result + eval. */
export interface EvaledBuilder<
  TPattern extends readonly PatternSchema[],
  TResultType extends ResultSpec
> {
  readonly "~pattern": TPattern;
  readonly "~resultType": TResultType;
  readonly "~eval": EvalFn;
}

/** Any completed chain state defineNode accepts. */
export type BuiltPattern<
  TPattern extends readonly PatternSchema[],
  TResultType extends ResultSpec | undefined
> = {
  readonly "~pattern": TPattern;
  readonly "~resultType": TResultType;
  readonly "~eval": EvalFn | undefined;
};

/** Immutable runtime builder: each call returns a fresh builder so a
 *  stored intermediate chain state stays valid (matching the types). */
function createBuilder(
  pattern: readonly PatternSchema[],
  resultType: ResultSpec | undefined,
  evalFn: EvalFn | undefined
): PatternBuilder & NameableBuilder<readonly [], {}, PatternSchemaBase> {
  const append = (element: PatternSchemaBase) =>
    createBuilder([...pattern, element], resultType, evalFn);
  const builder = {
    "~pattern": pattern,
    "~resultType": resultType,
    "~eval": evalFn,
    number: () => append({ kind: "number" }),
    string: (quotes: readonly string[]) => append({ kind: "string", quotes }),
    ident: () => append({ kind: "ident" }),
    path: () => append({ kind: "path" }),
    constVal: (value: string) => append({ kind: "const", value }),
    operand: (constraint?: ConstraintSpec) =>
      append({ kind: "expr", constraint, role: "operand" }),
    rest: (constraint?: ConstraintSpec) =>
      append({ kind: "expr", constraint, role: "rest" }),
    expr: (constraint?: ConstraintSpec) =>
      append({ kind: "expr", constraint, role: "expr" }),
    as: (name: string) => {
      const last = pattern[pattern.length - 1];
      if (last === undefined) {
        throw new Error("stringent: .as() requires a preceding element");
      }
      return createBuilder(
        [...pattern.slice(0, -1), { ...last, __named: true, name } as never],
        resultType,
        evalFn
      );
    },
    result: (def: ResultSpec) => createBuilder(pattern, def, evalFn),
    eval: (fn: EvalFn) => createBuilder(pattern, resultType, fn),
  };
  return builder as never;
}

// =============================================================================
// Node Definition Schema
// =============================================================================

/** Precedence: a non-negative safe integer. Lower binds looser; the
 *  HIGHEST level present in a grammar is the leaf level (literals,
 *  parens), whose patterns must start with a consuming element. */
export type Precedence = number;

/**
 * A node definition schema.
 *
 * Generic parameters capture the literal types needed for compile-time
 * grammar computation:
 * - TName: The unique node name (e.g., "add", "ternary")
 * - TPattern: The pattern elements as a tuple type
 * - TPrecedence: The precedence level (non-negative integer)
 * - TResultType: binding name, arktype string def, object def, or
 *   undefined (allowed only for passthrough patterns)
 */
export interface NodeSchema<
  TName extends string = string,
  TPattern extends readonly PatternSchema[] = readonly PatternSchema[],
  TPrecedence extends Precedence = Precedence,
  TResultType extends ResultSpec | undefined = ResultSpec | undefined
> {
  readonly name: TName;
  readonly pattern: TPattern;
  readonly precedence: TPrecedence;
  readonly resultType?: TResultType;

  /**
   * Optional: Evaluate the node to produce a runtime value.
   *
   * @param values - The named bindings as memoized thunks (evaluation is
   *   uniformly lazy — call a binding to evaluate it; untaken branches
   *   are never evaluated)
   */
  readonly eval?: EvalFn;
}

// =============================================================================
// Stored Function Types
// =============================================================================
//
// NOTE: This type uses loose typing (Record<string, () => unknown>)
// intentionally. When you call defineNode(), your eval function receives
// PROPERLY TYPED parameters via InferEvaluatedBindings. The loose type below
// is only used for STORAGE in NodeSchema (function parameter contravariance
// requires a common type to store heterogeneous nodes in one array).
// =============================================================================

/** Stored function type for eval - loose for variance compatibility */
export type EvalFn = (values: Record<string, () => unknown>) => unknown;

/** Every binding as a memoized thunk — eval's uniform parameter shape */
export type Thunked<T> = { [K in keyof T]: () => T[K] };

/**
 * The eval return type, verified against the declared resultType:
 * - binding name → the referenced binding's evaluated type
 * - arktype def (string or object) → its inferred type, resolved in a
 *   scope of the pattern's bindings so defs EMBEDDING references
 *   ("v | null", { value: "v" }) type correctly (mirrors the engines'
 *   per-parse scoped resolution; spike/union-defs)
 * - omitted (passthrough) → unknown
 */
export type EvalReturn<
  TResultType extends ResultSpec | undefined,
  TPattern extends readonly PatternSchema[]
> = TResultType extends string
  ? [FindNamedElement<TPattern, TResultType>] extends [never]
    ? InferDefIn<TResultType, EvalScope<TPattern>>
    : InferEvaluatedBindings<TPattern> extends infer EB
    ? TResultType extends keyof EB
      ? EB[TResultType]
      : unknown
    : unknown
  : TResultType extends object
  ? InferDefIn<TResultType, EvalScope<TPattern>>
  : unknown;

/**
 * Infer a def in a scope of already-inferred alias types, falling back to
 * unknown when unresolvable (e.g. custom parser-scope aliases, checked at
 * runtime instead).
 */
type InferDefIn<D, S> = [type.infer<D, S>] extends [never]
  ? unknown
  : type.infer<D, S>;

/**
 * The pattern's bindings as a resolution scope for defs embedding
 * references. Const bindings carry matched text, not a type — excluded
 * (mirrors the engines' template classification; see
 * parse/index.ts ScopeOfBindings and runtime/compile.ts).
 */
type EvalScope<TPattern extends readonly PatternSchema[]> = {
  [K in ExtractNamedSchemas<TPattern> as K["schema"] extends ConstSchema
    ? never
    : K["name"]]: InferEvaluatedTypeInPattern<TPattern, K["schema"]>;
};

/**
 * Define a node type for the grammar.
 *
 * The pattern is authored through a fluent builder (see PatternBuilder):
 * elements chain left to right, `.as(name)` names the element just
 * appended, `.result(def)` declares the node's result type (a binding
 * name, or an arktype def — validated against the chain's bindings), and
 * `.eval(fn)` attaches evaluation (bindings arrive as memoized thunks;
 * the return type is checked against the declared result). Every def is
 * validated by arktype WHERE IT IS WRITTEN — a typo like operand("nmbr")
 * is a compile error at that call.
 *
 * @example A polymorphic, short-circuiting ternary:
 * const ternary = defineNode({
 *   name: "ternary",
 *   precedence: 0,
 *   pattern: (p) => p
 *     .operand("boolean").as("cond")
 *     .constVal("?")
 *     .expr().as("then")
 *     .constVal(":")
 *     .rest("then").as("else")
 *     .result("then")
 *     .eval(({ cond, then, else: alt }) => (cond() ? then() : alt())),
 * });
 */
export function defineNode<
  const TName extends string,
  const TPattern extends readonly PatternSchema[],
  const TPrecedence extends Precedence,
  const TResultType extends ResultSpec | undefined = undefined
>(config: {
  readonly name: TName;
  readonly precedence: TPrecedence;
  readonly pattern: (p: PatternBuilder) => BuiltPattern<TPattern, TResultType>;
}): NodeSchema<TName, TPattern, TPrecedence, TResultType> {
  const built = config.pattern(createBuilder([], undefined, undefined));
  return {
    name: config.name,
    precedence: config.precedence,
    pattern: built["~pattern"],
    resultType: built["~resultType"],
    eval: built["~eval"],
  } as NodeSchema<TName, TPattern, TPrecedence, TResultType>;
}

// =============================================================================
// Binding Inference
// =============================================================================

/**
 * Infer the TypeScript type of an arktype string def, falling back to
 * unknown for defs arktype cannot statically resolve (e.g. custom scope
 * aliases, which are validated at runtime instead).
 */
export type InferDef<T extends string> = [type.infer<T>] extends [never]
  ? unknown
  : type.infer<T>;

/**
 * Infer the AST node type from a pattern schema.
 * This maps schema types to their corresponding node types.
 */
export type InferNodeType<TSchema extends PatternSchemaBase> =
  TSchema extends NumberSchema ? NumberNode
  : TSchema extends StringSchema ? StringNode
  : TSchema extends IdentSchema ? IdentNode
  : TSchema extends PathSchema ? PathNode
  : TSchema extends ConstSchema<infer V> ? ConstNode<V>
  : TSchema extends { kind: "expr" } ? { outputSchema: string }
  : never;

/** Find a named element in a pattern */
type FindNamedElement<
  TPattern extends readonly PatternSchema[],
  B extends string
> = TPattern extends readonly [
  infer F extends PatternSchema,
  ...infer R extends readonly PatternSchema[]
]
  ? F extends { __named: true; name: B }
    ? F
    : FindNamedElement<R, B>
  : never;

/** Extract the raw constraint property from an element (possibly NamedSchema) */
export type ExtractSpecOf<T> = T extends { constraint?: infer C } ? C : undefined;

/**
 * Normalize a constraint's TYPE: absent or widened-to-string (an
 * unconstrained factory call) → undefined; otherwise the literal.
 */
export type NormalizeConstraint<C> = [Exclude<C, undefined>] extends [never]
  ? undefined
  : [string] extends [Exclude<C, undefined>]
  ? undefined // widened string type → unconstrained
  : Exclude<C, undefined>;

/**
 * Evaluated type of a single element, WITHOUT binding-reference resolution
 * (references resolve to unknown here; use InferEvaluatedTypeInPattern).
 */
export type InferEvaluatedType<TSchema extends PatternSchemaBase> =
  TSchema extends NumberSchema ? number
  : TSchema extends StringSchema ? string
  : TSchema extends IdentSchema ? unknown
  : TSchema extends PathSchema ? unknown
  : TSchema extends ConstSchema<infer V> ? V // the matched text
  : TSchema extends { kind: "expr" }
  ? NormalizeConstraint<ExtractSpecOf<TSchema>> extends infer N
    ? N extends string
      ? InferDef<N>
      : unknown // unconstrained
    : never
  : never;

/**
 * Evaluated type of an element WITH binding-reference resolution against
 * the rest of the pattern: a constraint that names an earlier binding
 * resolves (transitively) to the referenced operand's constraint type;
 * otherwise the constraint is an arktype def.
 */
type InferEvaluatedTypeInPattern<
  TPattern extends readonly PatternSchema[],
  TSchema extends PatternSchemaBase
> = TSchema extends { kind: "expr" }
  ? NormalizeConstraint<ExtractSpecOf<TSchema>> extends infer N
    ? N extends OverlapsRef<infer B>
      ? ResolveReference<TPattern, B>
      : N extends string
      ? [FindNamedElement<TPattern, N>] extends [never]
        ? InferDef<N> // an arktype def, not a reference
        : ResolveReference<TPattern, N>
      : unknown // unconstrained slot
    : never
  : InferEvaluatedType<TSchema>;

/**
 * Resolve a binding reference to its target's evaluated type, following
 * reference CHAINS to the root constraint (c → b → a resolves all three
 * to a's def type). Tail-recursive; TSeen guards malformed cyclic inputs
 * (createParser rejects forward/self references structurally, so cycles
 * cannot be constructed through the public API).
 */
type ResolveReference<
  TPattern extends readonly PatternSchema[],
  TName extends string,
  TSeen extends string = never
> = TName extends TSeen
  ? unknown
  : FindNamedElement<TPattern, TName> extends infer Target
  ? Target extends { kind: "expr" }
    ? NormalizeConstraint<ExtractSpecOf<Target>> extends infer C
      ? C extends OverlapsRef<infer B>
        ? ResolveReference<TPattern, B, TSeen | TName>
        : C extends string
        ? [FindNamedElement<TPattern, C>] extends [never]
          ? InferDef<C> // the root: a def constraint
          : ResolveReference<TPattern, C, TSeen | TName> // follow the chain
        : unknown // unconstrained target
      : never
    : Target extends PatternSchemaBase
    ? InferEvaluatedType<Target> // non-expr target (number(), string(), …)
    : unknown // reference to a name that does not exist
  : never;

/**
 * Extract all NamedSchema entries from a pattern tuple as a union.
 */
type ExtractNamedSchemas<TPattern extends readonly PatternSchema[]> =
  TPattern[number] extends infer E
    ? E extends NamedSchema<infer S, infer N>
      ? { schema: S; name: N }
      : never
    : never;

/**
 * Infer bindings object type from a pattern (AST nodes).
 */
export type InferBindings<TPattern extends readonly PatternSchema[]> = {
  [K in ExtractNamedSchemas<TPattern> as K["name"]]: InferNodeType<K["schema"]>;
};

// =============================================================================
// Evaluated bindings
// =============================================================================

/**
 * Infer evaluated bindings from a pattern: the object type eval receives
 * (each property is delivered as a memoized thunk — see Thunked).
 *
 * A FLAT per-binding map: binding-reference constraints resolve to the
 * referenced operand's constraint type; everything else is the element's
 * own type. Linked bindings are intentionally NOT correlated into a
 * distributed union — the flat type is honest about what the parser
 * guarantees per binding, and arktype's `match` narrows per case for
 * polymorphic evals (see the fixture's `add`).
 *
 * @example
 * ```ts
 * type Pattern = [
 *   NamedSchema<ExprSchema<"number | string", "operand">, "left">,
 *   ConstSchema<"+">,
 *   NamedSchema<ExprSchema<"left", "rest">, "right">
 * ];
 * type EvalBindings = InferEvaluatedBindings<Pattern>;
 * // { left: string | number; right: string | number }
 * ```
 */
export type InferEvaluatedBindings<TPattern extends readonly PatternSchema[]> = {
  [K in ExtractNamedSchemas<TPattern> as K["name"]]: InferEvaluatedTypeInPattern<
    TPattern,
    K["schema"]
  >;
};
