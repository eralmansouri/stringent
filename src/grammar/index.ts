/**
 * Grammar Type Computation
 *
 * Computes a grammar TYPE from operator schemas. The grammar is a flat tuple
 * of precedence levels, sorted from lowest to highest precedence, with
 * built-in atoms as the final element.
 *
 * Example:
 *   [[AddOps], [MulOps], [BuiltInAtoms]]
 *   // level 0 (lowest prec) → level 1 → atoms (last)
 */

import type {
  Pipe,
  Numbers,
  Objects,
  Tuples,
  Fn,
  Unions,
  Call,
} from "hotscript";
import type { NodeSchema } from "../schema/index.js";
import type { BUILT_IN_ATOMS } from "../runtime/parser.js";

// =============================================================================
// Grammar Type
// =============================================================================

/**
 * A grammar is a tuple of levels, where each level is an array of node schemas.
 * Sorted by precedence (lowest first), built-in atoms last.
 */
export type Grammar = readonly (readonly NodeSchema[])[];

// =============================================================================
// Built-in Atom Types
// =============================================================================

/** Built-in atoms type - derived from the runtime definitions */
export type BuiltInAtoms = typeof BUILT_IN_ATOMS;

// =============================================================================
// Hotscript Helpers
// =============================================================================

/**
 * Compare precedence entries: numbers sort ascending.
 * Entry format: [precedence, nodes[]]
 */
interface SortByPrecedence extends Fn {
  return: Call<Numbers.LessThanOrEqual, this["arg0"][0], this["arg1"][0]>;
}

// =============================================================================
// ComputeGrammar
// =============================================================================

/**
 * Compute the grammar tuple from operator schemas.
 *
 * 1. Group operators by precedence
 * 2. Convert to entries and sort (numbers ascending)
 * 3. Extract just the node arrays
 * 4. Append built-in atoms as the last level
 */
type ComputeOperatorLevels<TNodes extends readonly NodeSchema[]> = Pipe<
  [...TNodes],
  [
    Tuples.GroupBy<Objects.Get<"precedence">>,
    Objects.Entries,
    Unions.ToTuple,
    Tuples.Sort<SortByPrecedence>,
    Tuples.Map<Tuples.At<1>>
  ]
>;

export type ComputeGrammar<TNodes extends readonly NodeSchema[]> =
  ComputeOperatorLevels<TNodes> extends infer Levels extends readonly (readonly NodeSchema[])[]
    ? readonly [...Levels, BuiltInAtoms]
    : never;
