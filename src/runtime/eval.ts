/**
 * Runtime Expression Evaluation
 *
 * Evaluates parsed AST nodes to produce runtime values.
 * Uses the eval functions defined in NodeSchema to compute results.
 *
 * The evaluator:
 * 1. Recursively evaluates child nodes first
 * 2. Passes evaluated values to the node's eval function
 * 3. Returns the computed result
 * 4. Validates values against arktype constraints at runtime
 */

import { type, Type } from 'arktype';
import type { NodeSchema, SchemaToType } from '../schema/index.js';

// =============================================================================
// Type Utilities for evaluate()
// =============================================================================

/**
 * Extract the outputSchema from an AST node type.
 * Returns the literal schema string if present, otherwise 'unknown'.
 */
type ExtractOutputSchema<T> = T extends { outputSchema: infer S extends string } ? S : 'unknown';

/**
 * A type that represents any AST node with an outputSchema field.
 * This is used as a constraint for the evaluate() function.
 */
export type ASTNodeWithSchema<TSchema extends string = string> = {
  readonly node: string;
  readonly outputSchema: TSchema;
};

// =============================================================================
// Variable Extraction Types (Task 6 - Connect Parse Schema to Eval Data)
// =============================================================================

/**
 * Recursively extract all identifier nodes from an AST.
 * Returns a union of { name: string, outputSchema: string } tuples.
 *
 * This is used to determine what variables are used in an expression
 * and what types they expect.
 */
type ExtractIdentifiers<T> = T extends { node: 'identifier'; name: infer N; outputSchema: infer S }
  ? { name: N; outputSchema: S }
  : T extends object
    ? { [K in keyof T]: ExtractIdentifiers<T[K]> }[keyof T]
    : never;

/**
 * Convert a union of identifier tuples to a data object type.
 *
 * @example
 * type Ids = { name: 'x'; outputSchema: 'number' } | { name: 'y'; outputSchema: 'string' };
 * type Data = IdentifiersToData<Ids>;
 * // { x: number; y: string }
 */
type IdentifiersToData<T> = T extends {
  name: infer N extends string;
  outputSchema: infer S extends string;
}
  ? { [K in N]: SchemaToType<S> }
  : never;

/**
 * Merge a union of single-key objects into a single object type.
 *
 * @example
 * type Union = { x: number } | { y: string };
 * type Merged = UnionToIntersection<Union>;
 * // { x: number } & { y: string }
 */
type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (
  k: infer I
) => void
  ? I
  : never;

/**
 * Extract required data types from an AST based on its identifier nodes.
 * Returns Record<string, never> if no identifiers are found (empty object is allowed).
 *
 * @example
 * type AST = { node: 'add'; left: { node: 'identifier'; name: 'x'; outputSchema: 'number' }; ... };
 * type Data = ExtractRequiredData<AST>;
 * // { x: number }
 */
export type ExtractRequiredData<T> =
  ExtractIdentifiers<T> extends never
    ? Record<string, never> // No identifiers - empty object is fine
    : UnionToIntersection<IdentifiersToData<ExtractIdentifiers<T>>>;

/**
 * Evaluation context that includes both the parse context and node schemas.
 * When AST type is provided, the data is type-checked against the AST's variables.
 */
export interface EvalContext<TData = Record<string, unknown>> {
  /** The data context (variable name → value mapping) */
  data: TData;
  /** The node schemas (for looking up eval functions) */
  nodes: readonly NodeSchema[];
}

// =============================================================================
// Runtime ArkType Validation
// =============================================================================

/**
 * Cache for arktype validators to avoid re-creating them for each evaluation.
 * Maps schema strings to their compiled validators.
 */
const validatorCache = new Map<string, Type>();

/**
 * Get or create an arktype validator for a given schema string.
 * Uses a cache to avoid re-creating validators for frequently used schemas.
 *
 * @param schema - The arktype schema string (e.g., 'number >= 0', 'string.email')
 * @returns The compiled arktype validator
 */
function getValidator(schema: string): Type {
  let validator = validatorCache.get(schema);
  if (!validator) {
    // Create and cache the validator
    // Note: Invalid schemas will cause arktype to throw at compile time
    // At runtime, we trust the schema was validated at parse time
    validator = type(schema as never) as Type;
    validatorCache.set(schema, validator);
  }
  return validator;
}

/**
 * Validate a value against an arktype schema at runtime.
 * Throws an error if the value doesn't match the schema constraints.
 *
 * @param value - The value to validate
 * @param schema - The arktype schema string (e.g., 'number >= 0', 'string.email')
 * @param variableName - The name of the variable (for error messages)
 * @throws Error if the value doesn't match the schema constraints
 */
function validateValue(value: unknown, schema: string, variableName: string): void {
  // Skip validation for generic schemas that don't have runtime constraints
  // These basic types are handled by TypeScript's compile-time checking
  if (schema === 'unknown' || schema === 'never') {
    return;
  }

  const validator = getValidator(schema);
  const result = validator(value);

  // arktype returns the value if valid, or an ArkErrors object if invalid
  if (result instanceof type.errors) {
    throw new Error(
      `Variable '${variableName}' failed validation for schema '${schema}': ${result.summary}`
    );
  }
}

/**
 * Evaluate an AST node to produce a runtime value.
 *
 * The return type is inferred from the AST node's `outputSchema` field:
 * - `outputSchema: "number"` → returns `number`
 * - `outputSchema: "string"` → returns `string`
 * - `outputSchema: "boolean"` → returns `boolean`
 * - `outputSchema: "null"` → returns `null`
 * - `outputSchema: "undefined"` → returns `undefined`
 * - Other/unknown → returns `unknown`
 *
 * @param ast - The parsed AST node to evaluate
 * @param ctx - The evaluation context containing variable values and node schemas
 * @returns The evaluated value with the type derived from the AST's outputSchema
 *
 * @example
 * ```ts
 * import { createParser, defineNode, lhs, rhs, constVal } from "stringent";
 * import { evaluate } from "stringent/runtime/eval";
 *
 * const add = defineNode({
 *   name: "add",
 *   pattern: [lhs("number").as("left"), constVal("+"), rhs("number").as("right")],
 *   precedence: 1,
 *   resultType: "number",
 *   eval: ({ left, right }) => left + right,
 * });
 *
 * const parser = createParser([add] as const);
 * const result = parser.parse("1+2", {});
 *
 * if (result.length === 2) {
 *   const value = evaluate(result[0], { data: {}, nodes: [add] });
 *   // value has type: number (not unknown!)
 *   // value === 3
 * }
 * ```
 */
export function evaluate<T, TData extends ExtractRequiredData<T>>(
  ast: T,
  ctx: EvalContext<TData>
): SchemaToType<ExtractOutputSchema<T>> {
  if (typeof ast !== 'object' || ast === null) {
    throw new Error(`Invalid AST node: expected object, got ${typeof ast}`);
  }

  const node = ast as Record<string, unknown>;

  // Check for the 'node' property that indicates the node type
  if (!('node' in node) || typeof node.node !== 'string') {
    throw new Error(`Invalid AST node: missing 'node' property`);
  }

  const nodeType = node.node as string;

  // The return type alias for casting - the runtime behavior is correct,
  // we just need to tell TypeScript what type to expect
  type ReturnType = SchemaToType<ExtractOutputSchema<T>>;

  // Handle literal nodes (number, string, boolean, null, undefined)
  if (nodeType === 'literal') {
    if ('value' in node) {
      return node.value as ReturnType;
    }
    throw new Error(`Literal node missing 'value' property`);
  }

  // Internal eval context for recursive calls (typed at runtime level)
  const internalCtx = ctx as EvalContext<Record<string, unknown>>;

  // Handle identifier nodes - look up value in context and validate against schema
  if (nodeType === 'identifier') {
    if (!('name' in node) || typeof node.name !== 'string') {
      throw new Error(`Identifier node missing 'name' property`);
    }
    const name = node.name as string;
    if (!(name in internalCtx.data)) {
      throw new Error(`Undefined variable: ${name}`);
    }
    const value = internalCtx.data[name];

    // Validate value against arktype schema at runtime
    if ('outputSchema' in node && typeof node.outputSchema === 'string') {
      validateValue(value, node.outputSchema, name);
    }

    return value as ReturnType;
  }

  // Handle const nodes (operators, keywords) - these shouldn't be evaluated directly
  if (nodeType === 'const') {
    throw new Error(`Cannot evaluate const node directly`);
  }

  // Handle parentheses - just evaluate the inner expression
  if (nodeType === 'parentheses') {
    if (!('inner' in node)) {
      throw new Error(`Parentheses node missing 'inner' property`);
    }
    // Use type assertion for recursive call (data constraint already validated at entry)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    return (evaluate as Function)(node.inner, internalCtx) as ReturnType;
  }

  // Look up the node schema for this node type
  const nodeSchema = internalCtx.nodes.find((n) => n.name === nodeType);
  if (!nodeSchema) {
    throw new Error(
      `Unknown node type: ${nodeType}. Make sure to pass all node schemas to evaluate().`
    );
  }

  if (!nodeSchema.eval) {
    throw new Error(`Node type '${nodeType}' has no eval function defined`);
  }

  // Extract and evaluate all named bindings from the node
  const evaluatedBindings: Record<string, unknown> = {};

  // Get the pattern to determine which fields are named bindings
  for (const element of nodeSchema.pattern) {
    // Check if this is a named schema (has __named and name)
    if ('__named' in element && element.__named === true && 'name' in element) {
      const bindingName = (element as { name: string }).name;
      if (bindingName in node) {
        // Recursively evaluate the child node
        // Use type assertion for recursive call (data constraint already validated at entry)
        // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
        evaluatedBindings[bindingName] = (evaluate as Function)(node[bindingName], internalCtx);
      }
    }
  }

  // Call the eval function with evaluated bindings
  return nodeSchema.eval(evaluatedBindings, internalCtx.data) as SchemaToType<
    ExtractOutputSchema<T>
  >;
}

/**
 * Create a bound evaluator function for a specific set of node schemas.
 *
 * This is a convenience function that pre-binds the node schemas,
 * so you only need to pass the AST and variable values when evaluating.
 *
 * The returned evaluator function preserves type inference:
 * - The return type is derived from the AST's `outputSchema` field
 * - `outputSchema: "number"` → returns `number`
 * - `outputSchema: "string"` → returns `string`
 * - etc.
 *
 * @param nodes - The node schemas with eval functions
 * @returns An evaluator function with type inference
 *
 * @example
 * ```ts
 * const evaluator = createEvaluator([add, mul]);
 *
 * const result = parser.parse("1+2*3", {});
 * if (result.length === 2) {
 *   const value = evaluator(result[0], {});
 *   // value has type: number (inferred from AST's outputSchema)
 *   // value === 7
 * }
 * ```
 */
export function createEvaluator(nodes: readonly NodeSchema[]) {
  return function evaluator<T, TData extends ExtractRequiredData<T>>(
    ast: T,
    data: TData
  ): SchemaToType<ExtractOutputSchema<T>> {
    return evaluate(ast, { data, nodes });
  };
}
