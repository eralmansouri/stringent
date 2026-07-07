/**
 * SCOPED INFERENCE — the proposed design: each fold level resolves the
 * embedded-reference def via type.infer<"left | null", { left: Acc }>,
 * carrying the INFERRED TYPE forward. TS union normalization gives a
 * fixed point (number | null | null ≡ number | null), so the type set
 * stays finite even at depth 500.
 */
import type { type } from "arktype";

type ResolveIn<D extends string, L> = type.infer<D, { left: L }>;

type Loop<N extends unknown[], Acc> = N["length"] extends 500
  ? Acc
  : ResolveIn<"left | null", Acc> extends infer Next
  ? [Next] extends [number | null] // the per-level assignability check
    ? Loop<[...N, 0], Next>
    : never
  : never;

type R = Loop<[], number>;
const r: R = null; // witness: number | null
export { r };
