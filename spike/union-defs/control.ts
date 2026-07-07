/**
 * CONTROL — today's model: a 500-deep fold where every level checks
 * assignability over a FIXED set of literal defs (finite def set → TS
 * memoizes each distinct check). Baseline for the other two files.
 */
import type { type } from "arktype";

type Assignable<A extends string, B extends string> = [type.infer<A>] extends [
  type.infer<B>
]
  ? true
  : false;

type Loop<N extends unknown[], Acc extends string> = N["length"] extends 500
  ? Acc
  : Assignable<Acc, "number | null"> extends true
  ? Loop<[...N, 0], "number">
  : never;

type R = Loop<[], "number">;
const r: R = "number";
export { r };
