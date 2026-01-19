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
 */

import type { NodeSchema } from '../schema/index.js';

/**
 * Evaluation context that includes both the parse context and node schemas.
 */
export interface EvalContext<TSchema extends Record<string, unknown> = Record<string, unknown>> {
  /** The data context (variable name → value mapping) */
  data: TSchema;
  /** The node schemas (for looking up eval functions) */
  nodes: readonly NodeSchema[];
}

/**
 * Evaluate an AST node to produce a runtime value.
 *
 * @param ast - The parsed AST node to evaluate
 * @param ctx - The evaluation context containing variable values and node schemas
 * @returns The evaluated value
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
 *   // value === 3
 * }
 * ```
 */
export function evaluate(ast: unknown, ctx: EvalContext): unknown {
  if (typeof ast !== 'object' || ast === null) {
    throw new Error(`Invalid AST node: expected object, got ${typeof ast}`);
  }

  const node = ast as Record<string, unknown>;

  // Check for the 'node' property that indicates the node type
  if (!('node' in node) || typeof node.node !== 'string') {
    throw new Error(`Invalid AST node: missing 'node' property`);
  }

  const nodeType = node.node as string;

  // Handle literal nodes (number, string, boolean, null, undefined)
  if (nodeType === 'literal') {
    if ('value' in node) {
      return node.value;
    }
    throw new Error(`Literal node missing 'value' property`);
  }

  // Handle identifier nodes - look up value in context
  if (nodeType === 'identifier') {
    if (!('name' in node) || typeof node.name !== 'string') {
      throw new Error(`Identifier node missing 'name' property`);
    }
    const name = node.name as string;
    if (!(name in ctx.data)) {
      throw new Error(`Undefined variable: ${name}`);
    }
    return ctx.data[name];
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
    return evaluate(node.inner, ctx);
  }

  // Look up the node schema for this node type
  const nodeSchema = ctx.nodes.find((n) => n.name === nodeType);
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
        evaluatedBindings[bindingName] = evaluate(node[bindingName], ctx);
      }
    }
  }

  // Call the eval function with evaluated bindings
  return nodeSchema.eval(evaluatedBindings, ctx.data);
}

/**
 * Create a bound evaluator function for a specific set of node schemas.
 *
 * This is a convenience function that pre-binds the node schemas,
 * so you only need to pass the AST and variable values when evaluating.
 *
 * @param nodes - The node schemas with eval functions
 * @returns An evaluator function
 *
 * @example
 * ```ts
 * const evaluator = createEvaluator([add, mul]);
 *
 * const result = parser.parse("1+2*3", {});
 * if (result.length === 2) {
 *   const value = evaluator(result[0], {});
 *   // value === 7
 * }
 * ```
 */
export function createEvaluator(nodes: readonly NodeSchema[]) {
  return function evaluator<TData extends Record<string, unknown>>(
    ast: unknown,
    data: TData
  ): unknown {
    return evaluate(ast, { data, nodes });
  };
}
