/**
 * Compile-time demonstrations of every type-level claim in DESIGN.md —
 * the twin of design-claims.test.ts, checked by `pnpm typecheck`. Each
 * block names the DESIGN.md section it pins. @ts-expect-error lines are
 * load-bearing: if the claimed compile error stops happening, typecheck
 * fails here.
 */

import type { InferOfDef, Parse, ComputeGrammar, Context } from "./index.js";
import { fixtureParser as parser } from "./__fixtures__/grammar.js";
import { fixtureNodes, formSchema } from "./__fixtures__/grammar.js";

type G = ComputeGrammar<typeof fixtureNodes>;
type EmptyCtx = Context<{}>;

type AssertTrue<T extends true> = T;
type AssertExtends<T, Base> = T extends Base ? true : false;

// =============================================================================
// DESIGN: validation layers — safeParse catches schema-leaf typos at
// compile time; evaluate cannot (inference poisoning), so the same typo
// only fails at runtime (design-claims.test.ts has the runtime half)
// =============================================================================

// @ts-expect-error — "numbr" is not a def; the leaf errors HERE
parser.safeParse("1+1", { x: "numbr" });

// the identical typo on evaluate() COMPILES — this line carrying no
// expect-error directive is the demonstration. (Careful: spelling the
// directive inside a prose comment ACTIVATES it — tsc matches the text
// anywhere in a comment. That mistake was made writing this file.)
parser.evaluate("1+1" as never, { x: "numbr" } as never, { x: 1 } as never);

// =============================================================================
// DESIGN: 'unknown' identifiers — constrained slots reject at compile
// time; unconstrained slots accept (eq's operands), failing only at eval
// =============================================================================

// @ts-expect-error — zz is not in the (empty) schema; add's slot rejects it
parser.parse("1 + zz", {});

// eq's unconstrained slots accept two unknowns AT RUNTIME (safeParse
// succeeds; evaluation throws — design-claims.test.ts). Literal mode is
// stricter: the type engine rejects "unknown" candidates in EVERY
// constrained slot, including overlapping() ones — a conservative
// engine divergence discovered writing this file:
// @ts-expect-error — literal mode rejects what the runtime parses
parser.parse("zz == yy", {});

// =============================================================================
// DESIGN: refinements are validation-only — the refined leaf ERASES for
// typing, so this parses at compile time (if parsing enforced
// refinements, this would be a compile error and "if it compiles, it
// parses" would break the other way for `parse`)
// =============================================================================

parser.parse("age + 1", { age: "number > 0" });

// =============================================================================
// DESIGN: correlated bindings — TS does NOT narrow sibling properties
// through typeof (needs unit-type discriminants; verified on TS 5.9)
// =============================================================================

declare const b:
  | { left: number; right: number }
  | { left: string; right: string };
if (typeof b.left === "string") {
  b.left.toUpperCase(); // the checked property narrows…
  // @ts-expect-error — …but b.right is STILL string | number
  b.right.toUpperCase();
}

// =============================================================================
// DESIGN: template outputSchema carrier — a TS type cannot be turned back
// into a def string, so the type level carries the resolved type; its
// INFERRED type matches the runtime's displayed expression
// =============================================================================

type PMaybeDemo = Parse<G, "x == null", Context<{ x: "string | null" }>>;
type _carrier = AssertTrue<AssertExtends<PMaybeDemo, [{ node: "eq" }, ""]>>;

// =============================================================================
// DESIGN: \xHH / \uHHHH escapes are runtime-only — literal mode rejects
// them (hex is undecodable in the type system); safeParse handles them
// (design-claims.test.ts has the runtime half)
// =============================================================================

// @ts-expect-error — hex escape in literal mode
parser.parse('"\\x41"', {});
// simple escapes work in BOTH engines:
parser.parse('"a\\"b"', {});

// =============================================================================
// DESIGN: the overlap corner is NOT conservative — TS does not reduce
// { v: string } & { v: number } to never, so the type level accepts an
// eq the runtime rejects. This line COMPILING is the demonstration; the
// runtime half (TYPE_MISMATCH + StringentParseError) is in
// design-claims.test.ts.
// =============================================================================

const disjointObjects = { a: { v: "string" }, b: { v: "number" } } as const;
parser.parse("a == b", disjointObjects); // compiles; throws at runtime

// =============================================================================
// DESIGN: wide schema types disable parse()'s guarantee — every
// identifier resolves optimistically, so a bogus literal COMPILES (and
// throws at runtime; see design-claims.test.ts)
// =============================================================================

declare const wide: Record<string, "number">;
parser.parse("nope + 1", wide); // compiles; throws at runtime

// =============================================================================
// DESIGN: scope aliases are compile-time blind — schemas/constraints
// using createParser's `scope` need casts at compile time; the runtime
// resolves them fully
// =============================================================================

// @ts-expect-error — "Money" resolves only in the parser's runtime scope
parser.safeParse("x", { x: "Money" });

// =============================================================================
// DESIGN: evaluation is typed end-to-end for literal inputs — derived
// result types flow to the call site
// =============================================================================

const concat = parser.evaluate("'a'+'b'", {}, {});
const sum = parser.evaluate("1+2", {}, {});
type _t1 = AssertTrue<AssertExtends<typeof concat, string>>;
type _t2 = AssertTrue<AssertExtends<typeof sum, number>>;

// witness InferOfDef over a carrier-or-def outputSchema at the API edge
type EqOut = PMaybeDemo extends [{ outputSchema: infer O }, string]
  ? InferOfDef<O>
  : never;
type _t3 = AssertTrue<AssertExtends<EqOut, boolean>>;

export {};
