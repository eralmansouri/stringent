/**
 * Grammar Type Computation (v2 placeholder)
 *
 * TODO(Phase 3): recompute typed precedence levels (sorted ascending,
 * highest level = leaf) for the rebuilt type-level engine. The runtime
 * equivalent lives in src/runtime/compile.ts (compileGrammar).
 */

import type { NodeSchema } from "../schema/index.js";

/**
 * A grammar is a tuple of levels, where each level is an array of node
 * schemas. Sorted by precedence (lowest first), the leaf level last.
 */
export type Grammar = readonly (readonly NodeSchema[])[];

/** TODO(Phase 3): compute typed levels from the node tuple */
export type ComputeGrammar<TNodes extends readonly NodeSchema[]> = Grammar;
