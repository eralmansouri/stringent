/**
 * Schema Types
 *
 * Pattern element schemas for defineNode. These are pure type descriptors
 * that preserve literal types for compile-time grammar computation.
 *
 * The key insight: defineNode returns a schema object whose TYPE carries
 * all the information needed for type-level parsing. No runtime magic —
 * every semantic construct (constraints, result derivation, associativity)
 * is declarative DATA so the type-level and runtime engines can interpret
 * it identically. This is why result types cannot be inferred from eval's
 * TypeScript return type: types drive parsing (backtracking) in BOTH
 * engines, and the runtime engine cannot see TypeScript types.
 */

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
// Constraints & Result Derivation
// =============================================================================

/**
 * Reference to another named binding in the same pattern: "this operand's
 * type must equal whatever the referenced operand parsed as".
 *
 * @example
 * // right operand must have the same type as the left one
 * pattern: [lhs(["number", "string"]).as("left"), constVal("+"), rhs(sameAs("left")).as("right")]
 */
export interface SameAsRef<TBinding extends string = string> {
  readonly kind: "sameAs";
  readonly binding: TBinding;
}

/** Create a same-type-as constraint referencing an earlier named binding */
export const sameAs = <const TBinding extends string>(
  binding: TBinding
): SameAsRef<TBinding> => ({ kind: "sameAs", binding });

/**
 * Derive a node's result type from a named operand: "this node's type is
 * whatever the referenced operand parsed as".
 *
 * @example
 * // a polymorphic parenthesization rule
 * defineNode({
 *   name: "parens",
 *   pattern: [constVal("("), expr().as("inner"), constVal(")")],
 *   precedence: "atom",
 *   resultType: fromBinding("inner"),
 *   eval: ({ inner }) => inner,
 * })
 */
export interface FromBindingRef<TBinding extends string = string> {
  readonly kind: "fromBinding";
  readonly binding: TBinding;
}

/** Create a result-type derivation referencing a named binding */
export const fromBinding = <const TBinding extends string>(
  binding: TBinding
): FromBindingRef<TBinding> => ({ kind: "fromBinding", binding });

/**
 * A constraint on an expression slot:
 * - a type name: exact match ("number")
 * - a list of type names: any of them (["number", "string"])
 * - sameAs(binding): same type as an earlier operand
 */
export type ConstraintSpec = string | readonly string[] | SameAsRef;

/** A node's result type: a static type name, or derived from an operand */
export type ResultSpec = string | FromBindingRef;

/** Runtime type guards for the marker objects */
export function isSameAs(value: unknown): value is SameAsRef {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { kind?: unknown }).kind === "sameAs"
  );
}

export function isFromBinding(value: unknown): value is FromBindingRef {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { kind?: unknown }).kind === "fromBinding"
  );
}

/**
 * Normalize a constraint's TYPE:
 * - absent / wide (unconstrained factory call) → undefined
 * - sameAs marker → SameAsRef<B> (resolved later against parsed siblings)
 * - list of names → the tuple
 * - single name → the literal
 *
 * The constraint property is OPTIONAL on ExprSchema, so it must be matched
 * with `constraint?:` — matching a required property never succeeds and
 * silently disables constraint checking (this was a real bug).
 */
export type NormalizeConstraint<C> = [Exclude<C, undefined>] extends [never]
  ? undefined
  : [ConstraintSpec] extends [Exclude<C, undefined>]
  ? undefined // fully wide: unconstrained lhs()/rhs()/expr() call
  : [Exclude<C, undefined>] extends [SameAsRef<infer B>]
  ? SameAsRef<B>
  : [Exclude<C, undefined>] extends [readonly string[]]
  ? [readonly string[]] extends [Exclude<C, undefined>]
    ? undefined // widened array type → unconstrained
    : Exclude<C, undefined>
  : [Exclude<C, undefined>] extends [string]
  ? [string] extends [Exclude<C, undefined>]
    ? undefined // widened string type → unconstrained
    : Exclude<C, undefined>
  : undefined;

/** Extract the raw constraint property from an element (possibly NamedSchema) */
export type ExtractSpecOf<T> = T extends { constraint?: infer C }
  ? C
  : undefined;

/** Expression role determines which grammar level is used */
export type ExprRole = "lhs" | "rhs" | "expr";

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
 * lhs("number").as("left")  // ExprSchema<"number", "lhs"> & { __named: true; name: "left" }
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
 * type by walking the (possibly nested) schema. Whitespace around the
 * dots is not allowed: `values . password` parses as just `values`.
 */
export const path = () => withAs<PathSchema>({ kind: "path" });

/** Create a constant (exact match) pattern element */
export const constVal = <const TValue extends string>(value: TValue) =>
  withAs<ConstSchema<TValue>>({ kind: "const", value });

/**
 * Create a LEFT-HAND SIDE expression element.
 *
 * Uses the next-higher grammar level to avoid left-recursion.
 * Must be at position 0 in an operator pattern.
 *
 * Constraint forms: lhs("number"), lhs(["number", "string"]), lhs()
 * (sameAs is not valid here — there is no earlier operand to reference).
 */
export const lhs = <const TConstraint extends ConstraintSpec>(
  constraint?: TConstraint
) =>
  withAs<ExprSchema<TConstraint, "lhs">>({
    kind: "expr",
    constraint: constraint,
    role: "lhs",
  });

/**
 * Create a RIGHT-HAND SIDE expression element.
 *
 * On right-associative levels it parses at the same level (1+2+3 = 1+(2+3));
 * on left-associative levels the fold parses it at the next level up.
 *
 * Constraint forms: rhs("number"), rhs(["number", "string"]),
 * rhs(sameAs("left")), rhs().
 */
export const rhs = <const TConstraint extends ConstraintSpec>(
  constraint?: TConstraint
) =>
  withAs<ExprSchema<TConstraint, "rhs">>({
    kind: "expr",
    constraint: constraint,
    role: "rhs",
  });

/**
 * Create a FULL expression element.
 *
 * Resets to the full grammar (precedence 0). Used for delimited contexts
 * like parentheses, ternary branches, function arguments.
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

/** Precedence type: non-negative integer for operators, "atom" for atoms */
export type Precedence = number | "atom";

/** Associativity for operator nodes. Defaults to "right". */
export type Associativity = "left" | "right";

/**
 * A node definition schema.
 *
 * Generic parameters capture the literal types needed for compile-time
 * grammar computation:
 * - TName: The unique node name (e.g., "add", "ternary")
 * - TPattern: The pattern elements as a tuple type
 * - TPrecedence: The precedence (number for operators, "atom" for atoms)
 * - TResultType: static type name, fromBinding(...) derivation, or
 *   undefined (allowed only for passthrough patterns)
 * - TAssoc: The associativity ("left" or "right", default "right")
 */
export interface NodeSchema<
  TName extends string = string,
  TPattern extends readonly PatternSchema[] = readonly PatternSchema[],
  TPrecedence extends Precedence = Precedence,
  TResultType extends ResultSpec | undefined = ResultSpec | undefined,
  TAssoc extends Associativity = Associativity
> {
  readonly name: TName;
  readonly pattern: TPattern;
  readonly precedence: TPrecedence;
  readonly resultType?: TResultType;
  readonly associativity: TAssoc;

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
 * The eval return type: SchemaToType of the static result type, the
 * referenced binding's evaluated type for fromBinding, unknown otherwise.
 */
export type EvalReturn<
  TResultType extends ResultSpec | undefined,
  TPattern extends readonly PatternSchema[]
> = TResultType extends string
  ? SchemaToType<TResultType>
  : TResultType extends FromBindingRef<infer B>
  ? InferEvaluatedBindings<TPattern> extends infer EB
    ? B extends keyof EB
      ? EB[B]
      : unknown
    : unknown
  : unknown;

/**
 * Define a node type for the grammar.
 *
 * The `const` modifier on generics ensures literal types are preserved.
 * resultType may be:
 * - a static type name ("number") — the node mints a type
 * - fromBinding("x") — derived per-parse from a named operand
 * - omitted — only for passthrough patterns (single unnamed non-const element)
 *
 * @example A polymorphic, short-circuiting ternary:
 * const ternary = defineNode({
 *   name: "ternary",
 *   pattern: [
 *     lhs("boolean").as("cond"), constVal("?"),
 *     expr().as("then"), constVal(":"),
 *     rhs(sameAs("then")).as("else"),
 *   ],
 *   precedence: 0,
 *   resultType: fromBinding("then"),
 *   lazy: true,
 *   eval: ({ cond, then, else: alt }) => (cond() ? then() : alt()),
 * });
 */
export function defineNode<
  const TName extends string,
  const TPattern extends readonly PatternSchema[],
  const TPrecedence extends Precedence,
  const TResultType extends ResultSpec | undefined = undefined,
  const TAssoc extends Associativity = "right",
  const TLazy extends boolean = false
>(config: {
  readonly name: TName;
  readonly pattern: TPattern;
  readonly precedence: TPrecedence;
  readonly resultType?: TResultType;
  readonly associativity?: TAssoc;
  readonly lazy?: TLazy;
  readonly eval?: (
    values: TLazy extends true
      ? Thunked<InferEvaluatedBindings<TPattern>>
      : InferEvaluatedBindings<TPattern>,
    runtimeValues: Record<string, unknown>
  ) => EvalReturn<TResultType, TPattern>;
}): NodeSchema<TName, TPattern, TPrecedence, TResultType, TAssoc> {
  return {
    ...config,
    associativity: config.associativity ?? ("right" as TAssoc),
  } as NodeSchema<TName, TPattern, TPrecedence, TResultType, TAssoc>;
}

// =============================================================================
// Binding Inference
// =============================================================================

/**
 * Map a schema type string to its TypeScript runtime type.
 * Used for eval return types and evaluated bindings.
 */
export type SchemaToType<T extends string> =
  T extends "number" ? number
  : T extends "string" ? string
  : T extends "boolean" ? boolean
  : unknown;

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

/**
 * Evaluated type of a single element, WITHOUT sameAs resolution
 * (sameAs resolves to unknown here; use InferEvaluatedTypeInPattern).
 */
export type InferEvaluatedType<TSchema extends PatternSchemaBase> =
  TSchema extends NumberSchema ? number
  : TSchema extends StringSchema ? string
  : TSchema extends IdentSchema ? unknown
  : TSchema extends PathSchema ? unknown
  : TSchema extends ConstSchema<infer V> ? V // the matched text
  : TSchema extends { kind: "expr" }
  ? NormalizeConstraint<ExtractSpecOf<TSchema>> extends infer N
    ? N extends readonly string[]
      ? SchemaToType<N[number]>
      : N extends string
      ? SchemaToType<N>
      : unknown // unconstrained or sameAs (unresolved)
    : never
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

/**
 * Evaluated type of an element WITH one-hop sameAs resolution against
 * the rest of the pattern.
 */
type InferEvaluatedTypeInPattern<
  TPattern extends readonly PatternSchema[],
  TSchema extends PatternSchemaBase
> = TSchema extends { kind: "expr" }
  ? NormalizeConstraint<ExtractSpecOf<TSchema>> extends SameAsRef<infer B>
    ? FindNamedElement<TPattern, B> extends infer Target extends PatternSchemaBase
      ? InferEvaluatedType<Target>
      : unknown
    : InferEvaluatedType<TSchema>
  : InferEvaluatedType<TSchema>;

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

/**
 * Infer evaluated bindings from a pattern (runtime values).
 * Used for eval() — receives already-evaluated values (or thunks of these
 * types when lazy: true). sameAs constraints resolve to the referenced
 * operand's type.
 *
 * @example
 * ```ts
 * type Pattern = [
 *   NamedSchema<ExprSchema<["number", "string"], "lhs">, "left">,
 *   ConstSchema<"+">,
 *   NamedSchema<ExprSchema<SameAsRef<"left">, "rhs">, "right">
 * ];
 * type EvalBindings = InferEvaluatedBindings<Pattern>;
 * // { left: number | string; right: number | string }
 * ```
 */
export type InferEvaluatedBindings<TPattern extends readonly PatternSchema[]> = {
  [K in ExtractNamedSchemas<TPattern> as K["name"]]: InferEvaluatedTypeInPattern<
    TPattern,
    K["schema"]
  >;
};
