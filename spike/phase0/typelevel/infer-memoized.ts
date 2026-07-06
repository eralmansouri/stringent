// Grammar-realistic: deep recursion where each level does an arktype
// assignability check over a FINITE def set (TS memoizes repeated args).
import type { type } from "arktype";
type Assignable<A extends string, B extends string> =
  type.infer<A> extends type.infer<B> ? true : false;
type Check = [
  Assignable<"number", "number | string">,
  Assignable<"'active'", "string">,
  Assignable<"boolean", "number">,
];
type Loop<T extends unknown[], Acc extends 0[] = []> =
  T extends [infer _, ...infer R]
    ? (Check extends [true, true, false] ? Loop<R, [...Acc, 0]> : never)
    : Acc["length"];
type Tup<N extends number, T extends unknown[] = []> =
  T["length"] extends N ? T : Tup<N, [...T, unknown]>;
export type R100 = Loop<Tup<100>>;
export type R500 = Loop<Tup<500>>;
const witness: R100 = 100 as R100;
