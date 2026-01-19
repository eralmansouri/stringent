/**
 * Runtime Type Inference
 *
 * Infers the result type of a parsed AST at runtime.
 *
 * With the new architecture, nodes carry their outputSchema directly,
 * so inference is simpler - just extract the outputSchema field.
 */

import type { Context } from '../context.js';

export type InferredType = string;

/**
 * Runtime inference - extracts outputSchema from parsed AST nodes.
 *
 * @param ast - The parsed AST node
 * @param context - Parse context (unused, kept for API compatibility)
 * @returns The result type of the AST node
 *
 * @example
 * ```ts
 * const result = parser.parse("1+2", {});
 * if (result.length === 2) {
 *   const type = infer(result[0], {}); // "number"
 * }
 * ```
 */
export function infer(ast: unknown, _context: Context): InferredType {
  if (typeof ast !== 'object' || ast === null) {
    throw new Error(`Invalid AST node: ${ast}`);
  }

  const node = ast as Record<string, unknown>;

  // Nodes with outputSchema (new architecture)
  if ('outputSchema' in node && typeof node.outputSchema === 'string') {
    return node.outputSchema;
  }

  throw new Error(`AST node has no outputSchema: ${JSON.stringify(ast)}`);
}
