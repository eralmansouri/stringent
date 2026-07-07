/**
 * Type-Level Parser (v2 placeholder)
 *
 * TODO(Phase 3): rebuild the type-level engine against the v2 semantics —
 * arktype-inferred constraint assignability (expressed over literal def
 * strings so TS memoizes checks, per spike/phase0/RESULTS.md), tail-shape
 * associativity, and numeric leaf levels — mirroring src/runtime/parser.ts
 * function-for-function.
 *
 * Until then, literal-mode parsing has no compile-time validation: Parse
 * resolves to a loose AST tuple, and parser.parse() accepts any string
 * (still throwing StringentParseError at runtime for invalid input).
 */

import type { Grammar } from "../grammar/index.js";
import type { Context } from "../context.js";

/** Loose AST node shape used until the type engine returns */
export interface LooseAstNode {
  readonly node: string;
  readonly outputSchema: string;
  readonly [key: string]: unknown;
}

/** TODO(Phase 3): compute the exact AST type for literal inputs */
export type Parse<
  TGrammar extends Grammar = Grammar,
  TInput extends string = string,
  $ extends Context = Context
> = [LooseAstNode, string];
