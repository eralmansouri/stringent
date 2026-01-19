/**
 * Schema Types
 *
 * Pattern element schemas for defineNode. These are pure type descriptors
 * that preserve literal types for compile-time grammar computation.
 *
 * The key insight: defineNode returns a schema object whose TYPE carries
 * all the information needed for type-level parsing. No runtime magic.
 */

import type {
  NumberNode,
  StringNode,
  IdentNode,
  ConstNode,
  NullNode,
  BooleanNode,
  UndefinedNode,
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

/** Identifier pattern element */
export interface IdentSchema extends Schema<"ident"> {}

/** Constant (exact match) pattern element */
export interface ConstSchema<TValue extends string = string>
  extends Schema<"const"> {
  readonly value: TValue;
}

/** Null literal pattern element */
export interface NullSchema extends Schema<"null"> {}

/** Boolean literal pattern element */
export interface BooleanSchema extends Schema<"boolean"> {}

/** Undefined literal pattern element */
export interface UndefinedSchema extends Schema<"undefined"> {}

/** Expression role determines which grammar level is used */
export type ExprRole = "lhs" | "rhs" | "expr";

/** Recursive expression pattern element with optional type constraint and role */
export interface ExprSchema<
  /** This technically shouldn't require a string
   * because JSON or array or other types could be used in the future.
   * For now, I would prefer that we just keep it open tbh. And validate at the
   * expr()/lhs()/rhs() usage site by
   * using arktype.type.validate<> (see createBox example: https://arktype.io/docs/generics).
   **/
  TConstraint extends string = string,
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
  | ConstSchema<string>
  | NullSchema
  | BooleanSchema
  | UndefinedSchema
  | ExprSchema<string, ExprRole>;

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

/** Create an identifier pattern element */
export const ident = () => withAs<IdentSchema>({ kind: "ident" });

/** Create a constant (exact match) pattern element */
export const constVal = <const TValue extends string>(value: TValue) =>
  withAs<ConstSchema<TValue>>({ kind: "const", value });

/** Create a null literal pattern element */
export const nullLiteral = () => withAs<NullSchema>({ kind: "null" });

/** Create a boolean literal pattern element */
export const booleanLiteral = () => withAs<BooleanSchema>({ kind: "boolean" });

/** Create an undefined literal pattern element */
export const undefinedLiteral = () => withAs<UndefinedSchema>({ kind: "undefined" });

/**
 * Create a LEFT-HAND SIDE expression element.
 *
 * Uses TNextLevel grammar to avoid left-recursion.
 * Must be at position 0 in a pattern.
 *
 * @example
 * ```ts
 * const add = defineNode({
 *   pattern: [lhs("number").as("left"), constVal("+"), rhs("number").as("right")],
 *   // lhs parses at higher precedence to avoid infinite recursion
 * });
 * ```
 */
export const lhs = <const TConstraint extends string>(constraint?: TConstraint) =>
  withAs<ExprSchema<TConstraint, "lhs">>({
    kind: "expr",
    constraint: constraint,
    role: "lhs",
  });

/**
 * Create a RIGHT-HAND SIDE expression element.
 *
 * Uses TCurrentLevel grammar to maintain precedence and enable right-associativity.
 * Used for right operands of binary operators.
 *
 * @example
 * ```ts
 * const add = defineNode({
 *   pattern: [lhs("number").as("left"), constVal("+"), rhs("number").as("right")],
 *   // rhs parses at same level for right-associativity: 1+2+3 = 1+(2+3)
 * });
 * ```
 */
export const rhs = <const TConstraint extends string>(constraint?: TConstraint) =>
  withAs<ExprSchema<TConstraint, "rhs">>({
    kind: "expr",
    constraint: constraint as TConstraint,
    role: "rhs",
  });

/**
 * Create a FULL expression element.
 *
 * Uses TFullGrammar - resets to full grammar (precedence 0).
 * Used for delimited contexts like parentheses, ternary branches, function arguments.
 *
 * @example
 * ```ts
 * const parens = defineNode({
 *   pattern: [constVal("("), expr().as("inner"), constVal(")")],
 *   // expr() can contain ANY expression, including low-precedence operators
 * });
 *
 * const ternary = defineNode({
 *   pattern: [lhs("boolean").as("cond"), constVal("?"), expr().as("then"), constVal(":"), expr().as("else")],
 *   // The branches can contain any expression
 * });
 * ```
 */
export const expr = <const TConstraint extends string>(constraint?: TConstraint) =>
  withAs<ExprSchema<TConstraint, "expr">>({
    kind: "expr",
    constraint: constraint as TConstraint,
    role: "expr",
  });

// =============================================================================
// Node Definition Schema
// =============================================================================

/** Precedence type: number for operators (lower = binds looser) */
export type Precedence = number;

/**
 * A node definition schema.
 *
 * This is the return type of defineNode. The generic parameters capture
 * all the literal types needed for compile-time grammar computation:
 * - TName: The unique node name (e.g., "add", "mul")
 * - TPattern: The pattern elements as a tuple type
 * - TPrecedence: The precedence (lower = binds looser, tried first)
 * - TResultType: The result type (e.g., "number", "string")
 */
export interface NodeSchema<
  TName extends string = string,
  TPattern extends readonly PatternSchema[] = readonly PatternSchema[],
  TPrecedence extends Precedence = Precedence,
  TResultType extends string = string
> {
  readonly name: TName;
  readonly pattern: TPattern;
  readonly precedence: TPrecedence;
  readonly resultType: TResultType;

  /**
   * Optional: Transform parsed bindings into node fields.
   * If not provided, bindings are used directly as fields.
   *
   * @param bindings - The named values extracted from pattern via .as()
   * @param ctx - The parse context
   * @returns The fields to add to the AST node
   */
  readonly configure?: ConfigureFn;

  /**
   * Optional: Evaluate the AST node to produce a runtime value.
   *
   * @param node - The full AST node including name, outputSchema, and fields
   * @param ctx - The evaluation context
   * @returns The evaluated value
   */
  readonly eval?: EvalFn;
}

// =============================================================================
// Stored Function Types
// =============================================================================
//
// NOTE: These types use loose typing (Record<string, unknown>) intentionally.
//
// When you call defineNode(), your eval/configure functions receive PROPERLY
// TYPED parameters via InferBindings and InferEvaluatedBindings. For example:
//
//   defineNode({
//     pattern: [lhs("number").as("left"), constVal("+"), rhs("number").as("right")],
//     eval: ({ left, right }) => left + right,  // ← left, right are typed as number!
//   })
//
// The loose types below are only used for STORAGE in NodeSchema. They must be
// loose because of function parameter contravariance: to store different nodes
// (with different binding types) in a NodeSchema[] array, we need a common type.
//
// TL;DR: Your IDE will show correct types. The loose types are internal only.
// =============================================================================

/** Stored function type for configure - loose for variance compatibility */
export type ConfigureFn = <$>(bindings: Record<string, unknown>, ctx: $) => Record<string, unknown>;

/** Stored function type for eval - loose for variance compatibility */
export type EvalFn = <$>(values: Record<string, unknown>, ctx: $) => unknown;

/**
 * Define a node type for the grammar.
 *
 * The `const` modifier on generics ensures literal types are preserved:
 * - name: "add" (not string)
 * - pattern: readonly [ExprSchema<"number">, ConstSchema<"+">, ExprSchema<"number">]
 * - precedence: 1 or "atom" (not number | "atom")
 * - resultType: "number" (not string)
 *
 * @example
 * const add = defineNode({
 *   name: "add",
 *   pattern: [lhs("number").as("left"), constVal("+"), rhs("number").as("right")],
 *   precedence: 1,
 *   resultType: "number",
 *   eval: ({ left, right }) => left + right,  // left and right are already numbers
 * });
 */
export function defineNode<
  const TName extends string,
  const TPattern extends readonly PatternSchema[],
  const TPrecedence extends Precedence,
  const TResultType extends string
>(config: {
  readonly name: TName;
  readonly pattern: TPattern;
  readonly precedence: TPrecedence;
  readonly resultType: TResultType;
  readonly configure?: <$>(
    bindings: InferBindings<TPattern>,
    ctx: $
  ) => Record<string, unknown>;
  readonly eval?: <$>(
    values: InferEvaluatedBindings<TPattern>,
    ctx: $
  ) => SchemaToType<TResultType>;
}): NodeSchema<TName, TPattern, TPrecedence, TResultType> {
  return config as NodeSchema<TName, TPattern, TPrecedence, TResultType>;
}

// =============================================================================
// Type Utilities
// =============================================================================

/** Extract the operator from a binary pattern (second element should be ConstSchema) */
export type ExtractOperator<T extends readonly PatternSchema[]> =
  T extends readonly [
    PatternSchema,
    infer Op extends ConstSchema,
    PatternSchema
  ]
    ? Op["value"]
    : never;

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
  : T extends "null" ? null
  : T extends "undefined" ? undefined
  : unknown;

/**
 * Infer the AST node type from a pattern schema.
 * This maps schema types to their corresponding node types.
 *
 * Note: ExprSchema maps to `unknown` since the actual type depends on the constraint
 * and what's parsed. The runtime parser will fill this in.
 */
export type InferNodeType<TSchema extends PatternSchemaBase> =
  TSchema extends NumberSchema ? NumberNode
  : TSchema extends StringSchema ? StringNode
  : TSchema extends IdentSchema ? IdentNode
  : TSchema extends ConstSchema ? ConstNode
  : TSchema extends NullSchema ? NullNode
  : TSchema extends BooleanSchema ? BooleanNode
  : TSchema extends UndefinedSchema ? UndefinedNode
  : TSchema extends ExprSchema<infer C> ? { outputSchema: C }
  : never;

/**
 * Infer the evaluated value type from a pattern schema.
 * For ExprSchema, uses the constraint to determine the runtime type.
 */
export type InferEvaluatedType<TSchema extends PatternSchemaBase> =
  TSchema extends NumberSchema ? number
  : TSchema extends StringSchema ? string
  : TSchema extends IdentSchema ? unknown
  : TSchema extends ConstSchema ? never  // constants are matched, not captured as values
  : TSchema extends NullSchema ? null
  : TSchema extends BooleanSchema ? boolean
  : TSchema extends UndefinedSchema ? undefined
  : TSchema extends ExprSchema<infer C extends string> ? SchemaToType<C>
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
 * Used for configure() - receives parsed AST nodes.
 *
 * @example
 * ```ts
 * type Pattern = [
 *   NamedSchema<ExprSchema<"number", "lhs">, "left">,
 *   ConstSchema<"+">,
 *   NamedSchema<ExprSchema<"number", "rhs">, "right">
 * ];
 * type Bindings = InferBindings<Pattern>;
 * // { left: { outputSchema: "number" }; right: { outputSchema: "number" } }
 * ```
 */
export type InferBindings<TPattern extends readonly PatternSchema[]> = {
  [K in ExtractNamedSchemas<TPattern> as K["name"]]: InferNodeType<K["schema"]>;
};

/**
 * Infer evaluated bindings from a pattern (runtime values).
 * Used for eval() - receives already-evaluated values.
 *
 * @example
 * ```ts
 * type Pattern = [
 *   NamedSchema<ExprSchema<"number", "lhs">, "left">,
 *   ConstSchema<"+">,
 *   NamedSchema<ExprSchema<"number", "rhs">, "right">
 * ];
 * type EvalBindings = InferEvaluatedBindings<Pattern>;
 * // { left: number; right: number }
 * ```
 */
export type InferEvaluatedBindings<TPattern extends readonly PatternSchema[]> = {
  [K in ExtractNamedSchemas<TPattern> as K["name"]]: InferEvaluatedType<K["schema"]>;
};
