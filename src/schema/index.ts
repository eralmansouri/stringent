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
} from '../primitive/index.js';
import { type } from 'arktype';

// =============================================================================
// Pattern Element Schemas
// =============================================================================
export interface Schema<TKind extends string> {
  readonly kind: TKind;
}

/** Number literal pattern element */
export interface NumberSchema extends Schema<'number'> {}

/** String literal pattern element */
export interface StringSchema<
  TQuotes extends readonly string[] = readonly string[],
> extends Schema<'string'> {
  readonly quotes: TQuotes;
}

/** Identifier pattern element */
export interface IdentSchema extends Schema<'ident'> {}

/** Constant (exact match) pattern element */
export interface ConstSchema<TValue extends string = string> extends Schema<'const'> {
  readonly value: TValue;
}

/** Null literal pattern element */
export interface NullSchema extends Schema<'null'> {}

/** Boolean literal pattern element */
export interface BooleanSchema extends Schema<'boolean'> {}

/** Undefined literal pattern element */
export interface UndefinedSchema extends Schema<'undefined'> {}

/** Expression role determines which grammar level is used */
export type ExprRole = 'lhs' | 'rhs' | 'expr';

/** Recursive expression pattern element with optional type constraint and role */
export interface ExprSchema<
  /** This technically shouldn't require a string
   * because JSON or array or other types could be used in the future.
   * For now, I would prefer that we just keep it open tbh. And validate at the
   * expr()/lhs()/rhs() usage site by
   * using arktype.type.validate<> (see createBox example: https://arktype.io/docs/generics).
   **/
  TConstraint extends string = string,
  TRole extends ExprRole = ExprRole,
> extends Schema<'expr'> {
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
  TName extends string = string,
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
export const number = () => withAs<NumberSchema>({ kind: 'number' });

/** Create a string literal pattern element */
export const string = <const TQuotes extends readonly string[]>(quotes: TQuotes) =>
  withAs<StringSchema<TQuotes>>({ kind: 'string', quotes });

/** Create an identifier pattern element */
export const ident = () => withAs<IdentSchema>({ kind: 'ident' });

/** Create a constant (exact match) pattern element */
export const constVal = <const TValue extends string>(value: TValue) =>
  withAs<ConstSchema<TValue>>({ kind: 'const', value });

/** Create a null literal pattern element */
export const nullLiteral = () => withAs<NullSchema>({ kind: 'null' });

/** Create a boolean literal pattern element */
export const booleanLiteral = () => withAs<BooleanSchema>({ kind: 'boolean' });

/** Create an undefined literal pattern element */
export const undefinedLiteral = () => withAs<UndefinedSchema>({ kind: 'undefined' });

/**
 * Create a LEFT-HAND SIDE expression element.
 *
 * Uses TNextLevel grammar to avoid left-recursion.
 * Must be at position 0 in a pattern.
 *
 * The constraint parameter is validated at compile time using arktype.
 * Invalid type strings like 'garbage' will cause TypeScript errors.
 *
 * @example
 * ```ts
 * const add = defineNode({
 *   pattern: [lhs("number").as("left"), constVal("+"), rhs("number").as("right")],
 *   // lhs parses at higher precedence to avoid infinite recursion
 * });
 *
 * // Valid arktype constraints:
 * lhs('number')           // primitive
 * lhs('string.email')     // subtype
 * lhs('number >= 0')      // constraint
 * lhs('string | number')  // union
 *
 * // Invalid - causes compile error:
 * // lhs('garbage')
 * ```
 */
export const lhs = <const TConstraint extends string>(constraint?: type.validate<TConstraint>) =>
  withAs<ExprSchema<TConstraint, 'lhs'>>({
    kind: 'expr',
    constraint: constraint as TConstraint,
    role: 'lhs',
  });

/**
 * Create a RIGHT-HAND SIDE expression element.
 *
 * Uses TCurrentLevel grammar to maintain precedence and enable right-associativity.
 * Used for right operands of binary operators.
 *
 * The constraint parameter is validated at compile time using arktype.
 * Invalid type strings like 'garbage' will cause TypeScript errors.
 *
 * @example
 * ```ts
 * const add = defineNode({
 *   pattern: [lhs("number").as("left"), constVal("+"), rhs("number").as("right")],
 *   // rhs parses at same level for right-associativity: 1+2+3 = 1+(2+3)
 * });
 *
 * // Valid arktype constraints:
 * rhs('number')           // primitive
 * rhs('string.email')     // subtype
 * rhs('number >= 0')      // constraint
 * rhs('string | number')  // union
 *
 * // Invalid - causes compile error:
 * // rhs('garbage')
 * ```
 */
export const rhs = <const TConstraint extends string>(constraint?: type.validate<TConstraint>) =>
  withAs<ExprSchema<TConstraint, 'rhs'>>({
    kind: 'expr',
    constraint: constraint as TConstraint,
    role: 'rhs',
  });

/**
 * Create a FULL expression element.
 *
 * Uses TFullGrammar - resets to full grammar (precedence 0).
 * Used for delimited contexts like parentheses, ternary branches, function arguments.
 *
 * The constraint parameter is validated at compile time using arktype.
 * Invalid type strings like 'garbage' will cause TypeScript errors.
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
 *
 * // Valid arktype constraints:
 * expr('number')           // primitive
 * expr('string.email')     // subtype
 * expr('number >= 0')      // constraint
 * expr('string | number')  // union
 *
 * // Invalid - causes compile error:
 * // expr('garbage')
 * ```
 */
export const expr = <const TConstraint extends string>(constraint?: type.validate<TConstraint>) =>
  withAs<ExprSchema<TConstraint, 'expr'>>({
    kind: 'expr',
    constraint: constraint as TConstraint,
    role: 'expr',
  });

// =============================================================================
// Node Definition Schema
// =============================================================================

/** Precedence type: number for operators (lower = binds looser) */
export type Precedence = number;

// =============================================================================
// Computed Result Type Specifications
// =============================================================================

/**
 * Marker for computed union result types.
 * When used as resultType, the outputSchema is computed at parse time
 * as the union of the outputSchemas from the specified bindings.
 *
 * @example
 * ```ts
 * const ternary = defineNode({
 *   name: 'ternary',
 *   pattern: [
 *     lhs('boolean').as('condition'),
 *     constVal('?'),
 *     expr().as('then'),
 *     constVal(':'),
 *     rhs().as('else'),
 *   ],
 *   precedence: 1,
 *   resultType: { union: ['then', 'else'] }, // Computed union of then/else types
 * });
 *
 * // Parsing 'x ? true : 0' would result in outputSchema: 'boolean | number'
 * ```
 */
export interface UnionResultType<TBindings extends readonly string[] = readonly string[]> {
  readonly union: TBindings;
}

/**
 * Result type specification for nodes.
 * Can be either:
 * - A string literal type (static result type validated by arktype)
 * - A UnionResultType object for computed union types
 */
export type ResultTypeSpec<T extends string | UnionResultType = string | UnionResultType> = T;

/**
 * A node definition schema.
 *
 * This is the return type of defineNode. The generic parameters capture
 * all the literal types needed for compile-time grammar computation:
 * - TName: The unique node name (e.g., "add", "mul")
 * - TPattern: The pattern elements as a tuple type
 * - TPrecedence: The precedence (lower = binds looser, tried first)
 * - TResultType: The result type (e.g., "number", "string", or UnionResultType)
 */
export interface NodeSchema<
  TName extends string = string,
  TPattern extends readonly PatternSchema[] = readonly PatternSchema[],
  TPrecedence extends Precedence = Precedence,
  TResultType extends string | UnionResultType = string | UnionResultType,
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
 * - resultType: "number" (not string), or { union: ['then', 'else'] } for computed unions
 *
 * The resultType parameter is validated at compile time using arktype (for string types).
 * Invalid type strings like 'garbage' will cause TypeScript errors.
 * Valid arktype types include: primitives, subtypes (string.email), constraints (number >= 0), unions.
 *
 * For computed union types, use { union: ['bindingA', 'bindingB'] } to compute the
 * outputSchema as the union of the outputSchemas of the named bindings.
 *
 * @example
 * ```ts
 * // Static result type
 * const add = defineNode({
 *   name: "add",
 *   pattern: [lhs("number").as("left"), constVal("+"), rhs("number").as("right")],
 *   precedence: 1,
 *   resultType: "number",
 *   eval: ({ left, right }) => left + right,
 * });
 *
 * // Computed union result type
 * const ternary = defineNode({
 *   name: "ternary",
 *   pattern: [
 *     lhs("boolean").as("condition"),
 *     constVal("?"),
 *     expr().as("then"),
 *     constVal(":"),
 *     rhs().as("else"),
 *   ],
 *   precedence: 0,
 *   resultType: { union: ["then", "else"] }, // outputSchema = then | else
 *   eval: ({ condition, then, else: elseVal }) => (condition ? then : elseVal),
 * });
 *
 * // Valid resultType examples:
 * // resultType: 'string'              // primitive
 * // resultType: 'string.email'        // subtype
 * // resultType: 'number >= 0'         // constraint
 * // resultType: 'string | number'     // static union
 * // resultType: { union: ['a', 'b'] } // computed union from bindings
 *
 * // Invalid - causes compile error:
 * // resultType: 'garbage'
 * ```
 */
// Overload for static string result types (validated by arktype)
export function defineNode<
  const TName extends string,
  const TPattern extends readonly PatternSchema[],
  const TPrecedence extends Precedence,
  const TResultType extends string,
>(config: {
  readonly name: TName;
  readonly pattern: TPattern;
  readonly precedence: TPrecedence;
  readonly resultType: type.validate<TResultType>;
  readonly configure?: <$>(bindings: InferBindings<TPattern>, ctx: $) => Record<string, unknown>;
  readonly eval?: <$>(
    values: InferEvaluatedBindings<TPattern>,
    ctx: $
  ) => SchemaToType<TResultType>;
}): NodeSchema<TName, TPattern, TPrecedence, TResultType>;

// Overload for computed union result types
export function defineNode<
  const TName extends string,
  const TPattern extends readonly PatternSchema[],
  const TPrecedence extends Precedence,
  const TBindings extends readonly string[],
>(config: {
  readonly name: TName;
  readonly pattern: TPattern;
  readonly precedence: TPrecedence;
  readonly resultType: UnionResultType<TBindings>;
  readonly configure?: <$>(bindings: InferBindings<TPattern>, ctx: $) => Record<string, unknown>;
  readonly eval?: <$>(values: InferEvaluatedBindings<TPattern>, ctx: $) => unknown;
}): NodeSchema<TName, TPattern, TPrecedence, UnionResultType<TBindings>>;

// Implementation
export function defineNode<
  const TName extends string,
  const TPattern extends readonly PatternSchema[],
  const TPrecedence extends Precedence,
  const TResultType extends string | UnionResultType,
>(config: {
  readonly name: TName;
  readonly pattern: TPattern;
  readonly precedence: TPrecedence;
  readonly resultType: TResultType;
  readonly configure?: <$>(bindings: InferBindings<TPattern>, ctx: $) => Record<string, unknown>;
  readonly eval?: <$>(values: InferEvaluatedBindings<TPattern>, ctx: $) => unknown;
}): NodeSchema<TName, TPattern, TPrecedence, TResultType> {
  return config as NodeSchema<TName, TPattern, TPrecedence, TResultType>;
}

// =============================================================================
// Type Utilities
// =============================================================================

/** Extract the operator from a binary pattern (second element should be ConstSchema) */
export type ExtractOperator<T extends readonly PatternSchema[]> = T extends readonly [
  PatternSchema,
  infer Op extends ConstSchema,
  PatternSchema,
]
  ? Op['value']
  : never;

// =============================================================================
// ArkType Integration
// =============================================================================

/**
 * Validate that a type definition string is a valid arktype definition.
 * This is used at compile time to reject invalid type strings like 'garbage'.
 *
 * @example
 * ```ts
 * type Valid = ValidArkType<'number'>;       // 'number' - valid
 * type Valid2 = ValidArkType<'string.email'>; // 'string.email' - valid
 * type Invalid = ValidArkType<'garbage'>;    // never - invalid
 * ```
 */
export type ValidArkType<T extends string> = type.validate<T>;

/**
 * Map a valid arktype schema string to its TypeScript runtime type.
 * Uses arktype's type.infer directly (no fallback for invalid types).
 *
 * Correctly infers types for:
 * - Primitives: 'number', 'string', 'boolean', 'null', 'undefined'
 * - Subtypes: 'string.email', 'number.integer' → base type (string, number)
 * - Constraints: 'number >= 0' → base type (number)
 * - Unions: 'string | number' → union type (string | number)
 *
 * Returns `never` for invalid type strings (no fallback).
 * Use `SchemaToType` if you need a fallback to `unknown`.
 *
 * @example
 * ```ts
 * type N = ArkTypeSchemaToType<'number'>;         // number
 * type S = ArkTypeSchemaToType<'string'>;         // string
 * type E = ArkTypeSchemaToType<'string.email'>;   // string
 * type C = ArkTypeSchemaToType<'number >= 0'>;    // number
 * type U = ArkTypeSchemaToType<'string | number'>; // string | number
 * type X = ArkTypeSchemaToType<'invalid'>;        // never
 * ```
 */
export type ArkTypeSchemaToType<T extends string> = type.infer<T>;

// =============================================================================
// Binding Inference
// =============================================================================

/**
 * Map a schema type string to its TypeScript runtime type.
 *
 * Handles common primitives directly for performance, then uses arktype's
 * type.infer for advanced types (subtypes, constraints, unions).
 *
 * For common types (fast path):
 * - 'number' → number
 * - 'string' → string
 * - 'boolean' → boolean
 * - 'null' → null
 * - 'undefined' → undefined
 * - 'unknown' → unknown
 *
 * For advanced arktype types (via type.infer):
 * - 'string.email' → string (subtype)
 * - 'number >= 0' → number (constrained)
 * - 'string | number' → string | number (union)
 *
 * Falls back to `unknown` for invalid types.
 *
 * @example
 * ```ts
 * type N = SchemaToType<'number'>;         // number
 * type S = SchemaToType<'string'>;         // string
 * type E = SchemaToType<'string.email'>;   // string (subtype inferred as base)
 * type C = SchemaToType<'number >= 0'>;    // number (constraint inferred as base)
 * type U = SchemaToType<'string | number'>; // string | number
 * type X = SchemaToType<'invalid'>;        // unknown (fallback)
 * ```
 */
export type SchemaToType<T extends string> =
  // Fast path for common primitives to avoid deep type instantiation
  T extends 'number'
    ? number
    : T extends 'string'
      ? string
      : T extends 'boolean'
        ? boolean
        : T extends 'null'
          ? null
          : T extends 'undefined'
            ? undefined
            : T extends 'unknown'
              ? unknown
              : // Detect advanced arktype syntax by checking for literal strings
                // Only evaluate arktype for LITERAL string types (not generic 'string')
                string extends T
                ? unknown // T is generic 'string', use fallback
                : // T is a literal string, safe to use arktype inference
                  SchemaToTypeAdvanced<T>;

/**
 * Internal helper for advanced type inference using arktype.
 * Only called when T is a literal string type (not generic 'string').
 */
type SchemaToTypeAdvanced<T extends string> =
  // Detect advanced arktype patterns
  T extends `${string}.${string}` // subtypes like 'string.email'
    ? ArkTypeSchemaToTypeSafe<T>
    : T extends `${string} ${string}` // constraints like 'number >= 0'
      ? ArkTypeSchemaToTypeSafe<T>
      : T extends `${string}|${string}` // unions without spaces like 'string|number'
        ? ArkTypeSchemaToTypeSafe<T>
        : T extends `${string} | ${string}` // unions with spaces like 'string | number'
          ? ArkTypeSchemaToTypeSafe<T>
          : T extends `${string}[]` // arrays like 'string[]'
            ? ArkTypeSchemaToTypeSafe<T>
            : // Fallback to unknown for unrecognized literal strings
              unknown;

/**
 * Safe wrapper around type.infer that falls back to unknown for invalid types.
 * This prevents TypeScript from erroring on invalid arktype definitions.
 */
type ArkTypeSchemaToTypeSafe<T extends string> = [type.infer<T>] extends [never]
  ? unknown
  : type.infer<T>;

/**
 * Infer the AST node type from a pattern schema.
 * This maps schema types to their corresponding node types.
 *
 * Note: ExprSchema maps to `unknown` since the actual type depends on the constraint
 * and what's parsed. The runtime parser will fill this in.
 */
export type InferNodeType<TSchema extends PatternSchemaBase> = TSchema extends NumberSchema
  ? NumberNode
  : TSchema extends StringSchema
    ? StringNode
    : TSchema extends IdentSchema
      ? IdentNode
      : TSchema extends ConstSchema
        ? ConstNode
        : TSchema extends NullSchema
          ? NullNode
          : TSchema extends BooleanSchema
            ? BooleanNode
            : TSchema extends UndefinedSchema
              ? UndefinedNode
              : TSchema extends ExprSchema<infer C>
                ? { outputSchema: C }
                : never;

/**
 * Infer the evaluated value type from a pattern schema.
 * For ExprSchema, uses the constraint to determine the runtime type.
 */
export type InferEvaluatedType<TSchema extends PatternSchemaBase> = TSchema extends NumberSchema
  ? number
  : TSchema extends StringSchema
    ? string
    : TSchema extends IdentSchema
      ? unknown
      : TSchema extends ConstSchema
        ? never // constants are matched, not captured as values
        : TSchema extends NullSchema
          ? null
          : TSchema extends BooleanSchema
            ? boolean
            : TSchema extends UndefinedSchema
              ? undefined
              : TSchema extends ExprSchema<infer C extends string>
                ? SchemaToType<C>
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
  [K in ExtractNamedSchemas<TPattern> as K['name']]: InferNodeType<K['schema']>;
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
  [K in ExtractNamedSchemas<TPattern> as K['name']]: InferEvaluatedType<K['schema']>;
};
