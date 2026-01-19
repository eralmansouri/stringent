/**
 * Context - carries schema data for identifier type resolution
 *
 * The context maps variable names to their types, enabling type-safe
 * parsing of expressions like `x + y` where x and y come from a schema.
 *
 * Grammar is now computed from node schemas via ComputeGrammar<Nodes>.
 */

// =============================================================================
// Schema Value Types
// =============================================================================

/**
 * Schema value type: either a valid arktype type string or a nested object schema.
 * This recursive type allows for nested object schemas like `{ x: { y: 'boolean' } }`.
 */
export type SchemaValue = string | { readonly [key: string]: SchemaValue };

/**
 * A schema record maps variable names to their type specifications.
 * Values can be arktype type strings or nested object schemas.
 */
export type SchemaRecord = { readonly [key: string]: SchemaValue };

// =============================================================================
// Context Interface
// =============================================================================

/**
 * Parse context with schema data.
 *
 * @typeParam TData - Schema mapping variable names to their types (strings or nested objects)
 *
 * @example
 * ```ts
 * type Ctx = Context<{ x: "number"; y: "string" }>;
 * // x resolves to type "number", y resolves to type "string"
 *
 * type NestedCtx = Context<{ user: { name: "string"; age: "number" } }>;
 * // user resolves to type { name: string; age: number }
 * ```
 */
export interface Context<TData extends SchemaRecord = SchemaRecord> {
  /** Schema types for identifier resolution */
  readonly data: TData;
}

// =============================================================================
// Default Context
// =============================================================================

/** Empty context (no schema variables) */
export const emptyContext: Context<{}> = { data: {} };

/** Type alias for empty context */
export type EmptyContext = Context<{}>;
