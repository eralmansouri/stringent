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
  TConstraint extends ConstraintSpec = ConstraintSpec,
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
  | ExprSchema<ConstraintSpec, ExprRole>;

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

/**
 * Schema wrapper with .as() method for naming bindings.
 * All pattern factories return this type.
 */
export type SchemaWithAs<TSchema extends PatternSchemaBase> = TSchema & {
  /** Add a binding name to this pattern element */
  as<TName extends string>(name: TName): NamedSchema<TSchema, TName>;
};

/** Create a schema wrapper with .as() method */
function withAs<TSchema extends PatternSchemaBase>(
  schema: TSchema
): TSchema & { as<TName extends string>(name: TName): NamedSchema<TSchema, TName> } {
  return Object.assign(schema, {
    as<TName extends string>(name: TName): NamedSchema<TSchema, TName> {
      return { ...schema, __named: true as const, name };
    },
  });
}

// =============================================================================
// Pattern Element Factories
// =============================================================================

/** Create a number literal pattern element */
export const number = () => withAs<NumberSchema>({ kind: "number" });

/** Create a string literal pattern element */
export const string = <const TQuotes extends readonly string[]>(
  quotes: TQuotes
) => withAs<StringSchema<TQuotes>>({ kind: "string", quotes });

/** Create an identifier pattern element (single segment, no dots) */
export const ident = () => withAs<IdentSchema>({ kind: "ident" });

/**
 * Create a member-access path pattern element.
 *
 * Matches `ident(.ident)*` — e.g. `values.password` — and resolves the
 * type by walking the schema. Whitespace around the dots is not allowed:
 * `values . password` parses as just `values`.
 */
export const path = () => withAs<PathSchema>({ kind: "path" });

/** Create a constant (exact match) pattern element */
export const constVal = <const TValue extends string>(value: TValue) =>
  withAs<ConstSchema<TValue>>({ kind: "const", value });

/**
 * Create a TIGHTER-LEVEL expression element.
 *
 * Parses at the next-higher grammar level, avoiding left-recursion.
 * A pattern whose final operand is operand() makes its level LEFT-associative
 * (the engine folds repetitions: `a-b-c` → `(a-b)-c`).
 *
 * Constraint forms: operand("number"), operand("string | number"), operand("left")
 * (a binding reference — not valid at position 0, where no earlier
 * operand exists), operand().
 */
export const operand = <const TConstraint extends ConstraintSpec>(
  constraint?: TConstraint
) =>
  withAs<ExprSchema<TConstraint, "operand">>({
    kind: "expr",
    constraint: constraint,
    role: "operand",
  });

/**
 * Create a CURRENT-LEVEL expression element.
 *
 * Parses at the same level. A pattern whose final operand is rest() makes
 * its level RIGHT-associative (`a ** b ** c` → `a ** (b ** c)`).
 *
 * Constraint forms: rest("number"), rest("string | number"), rest("left"),
 * rest().
 */
export const rest = <const TConstraint extends ConstraintSpec>(
  constraint?: TConstraint
) =>
  withAs<ExprSchema<TConstraint, "rest">>({
    kind: "expr",
    constraint: constraint,
    role: "rest",
  });

/**
 * Create a FULL expression element.
 *
 * Resets to the full grammar (precedence 0). Only for DELIMITED contexts —
 * every expr() must be followed by at least one constVal in the same
 * pattern (parentheses' ")", ternary's ":"), otherwise it would swallow
 * looser operators and break precedence.
 */
export const expr = <const TConstraint extends ConstraintSpec>(
  constraint?: TConstraint
) =>
  withAs<ExprSchema<TConstraint, "expr">>({
    kind: "expr",
    constraint: constraint,
    role: "expr",
  });

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
   * When true, eval receives THUNKS (() => value) instead of eagerly
   * evaluated values, enabling short-circuit semantics (ternary, &&, ||).
   */
  readonly lazy?: boolean;

  /**
   * Optional: Evaluate the node to produce a runtime value.
   *
   * @param values - The named bindings, evaluated (or thunks when lazy)
   * @param runtimeValues - The values object passed to evaluate()
   */
  readonly eval?: EvalFn;
}

// =============================================================================
// Stored Function Types
// =============================================================================
//
// NOTE: This type uses loose typing (Record<string, unknown>) intentionally.
// When you call defineNode(), your eval function receives PROPERLY TYPED
// parameters via InferEvaluatedBindings. The loose type below is only used
// for STORAGE in NodeSchema (function parameter contravariance requires a
// common type to store heterogeneous nodes in one array).
// =============================================================================

/** Stored function type for eval - loose for variance compatibility */
export type EvalFn = (
  values: Record<string, unknown>,
  runtimeValues: Record<string, unknown>
) => unknown;

/** Wrap every binding in a thunk (used when lazy: true) */
export type Thunked<T> = { [K in keyof T]: () => T[K] };

/**
 * The eval return type, verified against the declared resultType:
 * - binding name → the referenced binding's evaluated type
 * - arktype def (string or object) → its inferred type
 * - omitted (passthrough) → unknown
 */
export type EvalReturn<
  TResultType extends ResultSpec | undefined,
  TPattern extends readonly PatternSchema[]
> = TResultType extends string
  ? [FindNamedElement<TPattern, TResultType>] extends [never]
    ? InferDef<TResultType>
    : InferEvaluatedBindings<TPattern> extends infer EB
    ? TResultType extends keyof EB
      ? EB[TResultType]
      : unknown
    : unknown
  : TResultType extends object
  ? type.infer<TResultType>
  : unknown;

/**
 * Define a node type for the grammar.
 *
 * The `const` modifier on generics ensures literal types are preserved.
 * resultType may be:
 * - an arktype def ("boolean", { min: "number", max: "number" }) — the
 *   node mints a type
 * - a binding name ("then") — derived per-parse from that operand
 * - omitted — only for single-element passthrough patterns
 *
 * @example A polymorphic, short-circuiting ternary:
 * const ternary = defineNode({
 *   name: "ternary",
 *   pattern: [
 *     operand("boolean").as("cond"), constVal("?"),
 *     expr().as("then"), constVal(":"),
 *     rest("then").as("else"),
 *   ],
 *   precedence: 0,
 *   resultType: "then",
 *   lazy: true,
 *   eval: ({ cond, then, else: alt }) => (cond() ? then() : alt()),
 * });
 */
export function defineNode<
  const TName extends string,
  const TPattern extends readonly PatternSchema[],
  const TPrecedence extends Precedence,
  const TResultType extends ResultSpec | undefined = undefined,
  const TLazy extends boolean = false
>(config: {
  readonly name: TName;
  readonly pattern: TPattern;
  readonly precedence: TPrecedence;
  readonly resultType?: TResultType;
  readonly lazy?: TLazy;
  readonly eval?: (
    values: TLazy extends true
      ? Thunked<InferEvaluatedBindings<TPattern>>
      : InferEvaluatedBindings<TPattern>,
    runtimeValues: Record<string, unknown>
  ) => EvalReturn<NoInfer<TResultType>, TPattern>;
}): NodeSchema<TName, TPattern, TPrecedence, TResultType> {
  return config as NodeSchema<TName, TPattern, TPrecedence, TResultType>;
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
 * Evaluated type of an element WITH one-hop binding-reference resolution
 * against the rest of the pattern: a constraint that names an earlier
 * binding takes that element's type; otherwise the constraint is an
 * arktype def. (Used for bindings outside correlation groups — linked
 * bindings go through CorrelatedGroups below instead.)
 */
type InferEvaluatedTypeInPattern<
  TPattern extends readonly PatternSchema[],
  TSchema extends PatternSchemaBase
> = TSchema extends { kind: "expr" }
  ? NormalizeConstraint<ExtractSpecOf<TSchema>> extends infer N
    ? N extends OverlapsRef<infer B>
      ? EvaluatedTypeOfNamed<TPattern, B, unknown>
      : N extends string
      ? EvaluatedTypeOfNamed<TPattern, N, InferDef<N>>
      : unknown
    : never
  : InferEvaluatedType<TSchema>;

/** Resolve a named element's evaluated type, or TFallback when absent.
 *  Gated via a conditional (NOT an intersection with PatternSchemaBase —
 *  intersecting pollutes constraint inference with the wide base union). */
type EvaluatedTypeOfNamed<
  TPattern extends readonly PatternSchema[],
  B extends string,
  TFallback
> = [FindNamedElement<TPattern, B>] extends [never]
  ? TFallback
  : FindNamedElement<TPattern, B> extends infer Target
  ? Target extends PatternSchemaBase
    ? InferEvaluatedType<Target>
    : unknown
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
// Correlated bindings (Phase 4)
// =============================================================================
//
// When a pattern links operands via binding references (rest("left"),
// overlapping("left")), the evaluated bindings are typed as a DISTRIBUTED
// UNION over the root operand's constraint members: "number | string"
// yields { left: string; right: string } | { left: number; right: number }
// instead of two independent unions.
//
// TypeScript does NOT narrow sibling properties through a typeof check on
// one property (`typeof b.left === "string"` narrows b.left, never b.right
// — verified against TS 5.9; discriminant narrowing needs unit types). The
// union's payoff is arktype's `match` (D14): its cases cover exactly the
// union's branches, handlers are typed per branch, and `.default("assert")`
// guards the unreachable rest. Plain functions must check each property
// they use, or cast.
//
// Correlation granularity is DEF-level: "string | number" splits into
// members "string" and "number"; "boolean" stays ONE branch (TS-level
// distribution would split it into true | false — a value-level correlation
// the parser never enforces; parse-time types are whole defs).
//
// Soundness caveat (documented in V2-PLAN.md): values may straddle
// branches at runtime when a union-typed schema identifier fills either
// side — the root parsing AS the whole union (`x + 1`), or, for
// overlapping() refs, a referencer whose union type merely OVERLAPS the
// root's parsed member. Same pragmatic hole TS accepts for correlated
// unions; `.default("assert")` turns it into a runtime error.

/** The binding name an element's constraint references, or never. */
type RefTargetOf<
  TPattern extends readonly PatternSchema[],
  TSchema
> = TSchema extends { kind: "expr" }
  ? NormalizeConstraint<ExtractSpecOf<TSchema>> extends infer N
    ? N extends OverlapsRef<infer B>
      ? [FindNamedElement<TPattern, B>] extends [never]
        ? never
        : B
      : N extends string
      ? [FindNamedElement<TPattern, N>] extends [never]
        ? never
        : N
      : never
    : never
  : never;

/** Follow reference chains to their root binding (a ← b ← c ⇒ a for all).
 *  TSeen guards malformed cyclic inputs (createParser rejects them). */
type RootOf<
  TPattern extends readonly PatternSchema[],
  N extends string,
  TSeen extends string = never
> = N extends TSeen
  ? N
  : RefTargetOf<TPattern, FindNamedElement<TPattern, N>> extends infer T
  ? [T] extends [never]
    ? N
    : T extends string
    ? RootOf<TPattern, T, TSeen | N>
    : N
  : never;

/** Names of bindings whose constraints (transitively) reference TRoot. */
type ReferencersOf<
  TPattern extends readonly PatternSchema[],
  TRoot extends string
> = ExtractNamedSchemas<TPattern> extends infer K
  ? K extends { name: infer N extends string }
    ? N extends TRoot
      ? never
      : RootOf<TPattern, N> extends TRoot
      ? N
      : never
    : never
  : never;

/** Correlation roots, in pattern order: named non-reference elements that
 *  at least one other binding references. */
type CorrelationRoots<
  TPattern extends readonly PatternSchema[],
  TRest extends readonly PatternSchema[] = TPattern
> = TRest extends readonly [
  infer F extends PatternSchema,
  ...infer R extends readonly PatternSchema[]
]
  ? F extends NamedSchema<PatternSchemaBase, infer N extends string>
    ? [RefTargetOf<TPattern, F>] extends [never]
      ? [ReferencersOf<TPattern, N>] extends [never]
        ? CorrelationRoots<TPattern, R>
        : [N, ...CorrelationRoots<TPattern, R>]
      : CorrelationRoots<TPattern, R>
    : CorrelationRoots<TPattern, R>
  : [];

type TrimDef<S extends string> = S extends ` ${infer R}`
  ? TrimDef<R>
  : S extends `${infer R} `
  ? TrimDef<R>
  : S;

/** Split a def on "|" into member defs. Approximate: "|" nested inside
 *  parens/literals produces invalid members, detected below → the whole
 *  def stays one branch. */
type SplitDefUnion<S extends string> = S extends `${infer A}|${infer B}`
  ? TrimDef<A> | SplitDefUnion<B>
  : TrimDef<S>;

/** Did the split produce a fragment that is not a resolvable def? */
type HasInvalidMember<M extends string> = true extends (
  M extends string ? ([type.infer<M>] extends [never] ? true : never) : never
)
  ? true
  : false;

/** What a root distributes over: a union of member DEF strings, or a
 *  single TS type wrapped in a no-distribution marker. */
type RootBranches<
  TPattern extends readonly PatternSchema[],
  TRoot extends string
> = FindNamedElement<TPattern, TRoot> extends infer El
  ? El extends { kind: "expr" }
    ? NormalizeConstraint<ExtractSpecOf<El>> extends infer N
      ? N extends string
        ? SplitDefUnion<N> extends infer M extends string
          ? HasInvalidMember<M> extends true
            ? { __single: InferDef<N> }
            : M
          : { __single: unknown }
        : { __single: unknown } // unconstrained root
      : never
    : El extends PatternSchemaBase
    ? { __single: InferEvaluatedType<El> } // e.g. number().as("n")
    : { __single: unknown }
  : never;

/** Merge an intersection of object types into one flat object type. */
type MergeShape<T> = { [K in keyof T]: T[K] };

/** Cross product of correlation groups: one union branch per combination
 *  of member defs across roots; each branch assigns the member's type to
 *  the root and all its referencers. */
type CorrelatedGroups<
  TPattern extends readonly PatternSchema[],
  TRoots extends readonly string[]
> = TRoots extends readonly [
  infer R extends string,
  ...infer Rest extends readonly string[]
]
  ? RootBranches<TPattern, R> extends infer M
    ? M extends string
      ? GroupBranch<TPattern, R, InferDef<M>, Rest>
      : M extends { __single: infer T }
      ? GroupBranch<TPattern, R, T, Rest>
      : never
    : never
  : {};

type GroupBranch<
  TPattern extends readonly PatternSchema[],
  R extends string,
  T,
  TRest extends readonly string[]
> = CorrelatedGroups<TPattern, TRest> extends infer Tail
  ? Tail extends object
    ? MergeShape<Record<R | ReferencersOf<TPattern, R>, T> & Tail>
    : never
  : never;

/** All binding names covered by some correlation group. */
type CorrelatedNames<
  TPattern extends readonly PatternSchema[],
  TRoots extends readonly string[]
> = TRoots[number] | ReferencersOf<TPattern, TRoots[number]>;

/**
 * Infer evaluated bindings from a pattern (runtime values).
 * Used for eval() — receives already-evaluated values (or thunks of these
 * types when lazy: true). Binding-reference constraints resolve to the
 * referenced operand's type; reference-linked bindings are correlated as a
 * distributed union over the root's constraint members (see above).
 *
 * @example
 * ```ts
 * type Pattern = [
 *   NamedSchema<ExprSchema<"number | string", "operand">, "left">,
 *   ConstSchema<"+">,
 *   NamedSchema<ExprSchema<"left", "rest">, "right">
 * ];
 * type EvalBindings = InferEvaluatedBindings<Pattern>;
 * // { left: number; right: number } | { left: string; right: string }
 * ```
 */
export type InferEvaluatedBindings<TPattern extends readonly PatternSchema[]> =
  CorrelationRoots<TPattern> extends infer TRoots extends readonly string[]
    ? TRoots extends readonly []
      ? {
          [K in ExtractNamedSchemas<TPattern> as K["name"]]: InferEvaluatedTypeInPattern<
            TPattern,
            K["schema"]
          >;
        }
      : CorrelatedGroups<TPattern, TRoots> extends infer G
      ? G extends object
        ? MergeShape<
            {
              [K in ExtractNamedSchemas<TPattern> as K["name"] extends CorrelatedNames<
                TPattern,
                TRoots
              >
                ? never
                : K["name"]]: InferEvaluatedTypeInPattern<TPattern, K["schema"]>;
            } & G
          >
        : never
      : never
    : never;
