/**
 * Semantics check: does type.infer's second parameter act as a scope of
 * ALREADY-INFERRED alias types, resolving embedded binding references?
 * (This is the type-level twin of scope({left: t}).type("left | null").)
 */
import type { type } from "arktype";

type Scoped = type.infer<"left | null", { left: number }>;

// witness both directions: number | null accepted, string rejected
const w1: Scoped = 1;
const w2: Scoped = null;
// @ts-expect-error — string is not in the union
const w3: Scoped = "a";

type Eq<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const exact: Eq<Scoped, number | null> = true;

// embedded references also work inside structures and operators
type InArray = type.infer<"left[]", { left: number }>;
const w4: InArray = [1, 2];
// (object syntax is not string-embeddable — Phase 0 finding — use object defs)
type InObject = type.infer<{ value: "left" }, { left: string }>;
const w5: InObject = { value: "x" };

// fixed point: substituting the result back in normalizes (TS union dedup)
type Step1 = type.infer<"left | null", { left: number }>;
type Step2 = type.infer<"left | null", { left: Step1 }>;
const fixedPoint: Eq<Step1, Step2> = true;

export { w1, w2, w3, w4, w5, exact, fixedPoint };
