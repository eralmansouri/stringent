// Control: recursive loop, trivial check per level, no arktype.
type Loop<T extends unknown[], Acc extends 0[] = []> =
  T extends [infer _, ...infer R]
    ? ("number" extends "number" ? Loop<R, [...Acc, 0]> : never)
    : Acc["length"];
type Tup<N extends number, T extends unknown[] = []> =
  T["length"] extends N ? T : Tup<N, [...T, unknown]>;
export type R100 = Loop<Tup<100>>;
export type R500 = Loop<Tup<500>>;
const witness: R100 = 100 as R100;
