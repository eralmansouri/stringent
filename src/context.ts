/**
 * Context - carries schema data for identifier/path type resolution
 *
 * The context maps variable names to their types, enabling type-safe
 * parsing of expressions like `x + y` where x and y come from a schema.
 *
 * Schemas may be nested: `{ values: { password: "string" } }` allows
 * member-access expressions like `values.password` (via the path()
 * pattern element).
 */

// =============================================================================
// Schema Shape
// =============================================================================

/**
 * The shape of a schema: an ARKTYPE OBJECT DEF. Leaf values are arktype
 * defs ("number", "string.email", "number > 0", nested objects…),
 * addressable with dotted paths via the path() pattern element.
 *
 * @example
 * ```ts
 * const schema = {
 *   x: "number",
 *   values: { password: "string", confirmPassword: "string" },
 * } satisfies SchemaShape;
 * ```
 */
export type SchemaShape = { readonly [key: string]: unknown };

// =============================================================================
// Context Interface
// =============================================================================

/**
 * Parse context with schema data.
 *
 * @typeParam TData - Schema mapping variable names to their types
 *
 * @example
 * ```ts
 * type Ctx = Context<{ x: "number"; y: "string" }>;
 * // x resolves to type "number", y resolves to type "string"
 * ```
 */
export interface Context<TData extends SchemaShape = SchemaShape> {
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
