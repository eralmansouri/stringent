/**
 * Type-Level Inference
 *
 * Infer<AST, Context> computes the result type of a parsed AST.
 *
 * With the new architecture, nodes carry their outputSchema directly,
 * so inference is simpler - just extract the outputSchema field.
 */

import type { Context } from '../context.js';

/**
 * Infer the result type of an AST node.
 *
 * Nodes now carry their outputSchema directly:
 * - NumberNode has outputSchema: "number"
 * - BinaryNode<Name, Left, Right, OutputSchema> has outputSchema: OutputSchema
 * - IdentNode<Name, OutputSchema> has outputSchema: OutputSchema
 *
 * @example
 * ```ts
 * type Num = Infer<NumberNode<"42">, {}>;  // "number"
 * type Add = Infer<BinaryNode<"add", NumberNode<"1">, NumberNode<"2">, "number">, {}>; // "number"
 * ```
 */
export type Infer<AST, _$ extends Context> =
  // Extract outputSchema from any node that has it
  AST extends { outputSchema: infer R extends string } ? R : never;
