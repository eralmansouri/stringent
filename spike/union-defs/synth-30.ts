/**
 * TEXTUAL SUBSTITUTION at depth 30 — the alternative design: each level
 * SYNTHESIZES a new def string (`(${Acc}) | null`) and re-infers it.
 * Every level's def is a distinct, growing string → arktype's type-level
 * parser re-parses O(len) per level. Depth 30 matches the left-chain
 * canary in src/types.typetest.ts.
 */
import type { type } from "arktype";

type Assignable<A extends string, B extends string> = [type.infer<A>] extends [
  type.infer<B>
]
  ? true
  : false;

type Loop<N extends unknown[], Acc extends string> = N["length"] extends 30
  ? Acc
  : Assignable<Acc, "number | null"> extends true
  ? Loop<[...N, 0], `(${Acc}) | null`>
  : never;

type R = Loop<[], "number">;
declare const r: R;
const witness: string = r;
export { witness };
