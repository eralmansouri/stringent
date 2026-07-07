/**
 * Compile-time demonstrations of every type-level claim in DESIGN.md —
 * the twin of design-claims.test.ts, checked by `pnpm typecheck`. Each
 * block names the DESIGN.md section it pins. @ts-expect-error lines are
 * load-bearing: if the claimed compile error stops happening, typecheck
 * fails here.
 */

import type { type } from "arktype";
import type {
  InferOfDef,
  Parse,
  ComputeGrammar,
  Context,
  SchemaShape,
} from "./index.js";
import type { ValidatedInput, EvaluateResult } from "./createParser.js";
import { fixtureParser as parser } from "./__fixtures__/grammar.js";
import { fixtureNodes, formSchema } from "./__fixtures__/grammar.js";

type G = ComputeGrammar<typeof fixtureNodes>;
type EmptyCtx = Context<{}>;

type AssertTrue<T extends true> = T;
type AssertExtends<T, Base> = T extends Base ? true : false;
type AssertEqual<T, Expected> = [T] extends [Expected]
  ? [Expected] extends [T]
    ? true
    : false
  : false;

// =============================================================================
// DESIGN: the inference-poisoning limit — WHY parse/evaluate cannot carry
// type.validate on their schema parameter while safeParse can. Four
// variants of evaluate()'s REAL signature, differing only in how schema
// and values are declared. (These use the actual ValidatedInput/
// EvaluateResult types from createParser.ts.)
// =============================================================================

type PG = ComputeGrammar<typeof fixtureNodes>;

// 1 — CONTROL, the shipped shape: schema naked, values NoInfer'd. Works.
declare function evalControl<
  TInput extends string,
  const TSchema extends SchemaShape
>(
  input: ValidatedInput<PG, TInput, Context<TSchema>>,
  schema: TSchema,
  values: NoInfer<type.infer<TSchema>>
): EvaluateResult<PG, TInput, TSchema>;
const okControl: number = evalControl("x+1", { x: "number" }, { x: 41 });

// 2 — schema routed through type.validate (what safeParse does), with
// the deferred-conditional input: METASTABLE. This exact call typechecks
// in THIS file but the byte-identical signature+call collapses to
// `input: never` in a file whose declarations are ordered differently
// (bisected 2026-07-07: control declared before/after flips it). An API
// whose inference depends on unrelated neighbors is unshippable, which
// is why parse/evaluate do NOT carry validate. No expect-error here —
// a neighborhood-dependent outcome cannot be pinned; the declaration
// stays as documentation of the shape:
declare function evalWithValidate<
  TInput extends string,
  const TSchema extends SchemaShape
>(
  input: ValidatedInput<PG, TInput, Context<TSchema>>,
  schema: type.validate<TSchema>,
  values: NoInfer<type.infer<TSchema>>
): EvaluateResult<PG, TInput, TSchema>;

// 3 — values WITHOUT NoInfer (the original bug NoInfer fixed): same death.
declare function evalBareInfer<
  TInput extends string,
  const TSchema extends SchemaShape
>(
  input: ValidatedInput<PG, TInput, Context<TSchema>>,
  schema: TSchema,
  values: type.infer<TSchema>
): EvaluateResult<PG, TInput, TSchema>;
// @ts-expect-error — input is 'never': the values argument poisoned TSchema
evalBareInfer("x+1", { x: "number" }, { x: 41 });

// 3' — the SMOKING GUN, mechanism of (3): reveal what TSchema fixes to.
// TS inverts the mapped type inside type.infer and admits the VALUES
// argument as an inference candidate, then UNIONS the candidates. The
// 41-leaf is not a def, so Parse<> over that branch fails downstream.
declare function revealBareInfer<
  TInput extends string,
  const TSchema extends SchemaShape
>(input: TInput, schema: TSchema, values: type.infer<TSchema>): TSchema;
const poisoned = revealBareInfer("x+1", { x: "number" }, { x: 41 });
type _poisonedUnion = AssertTrue<
  AssertEqual<typeof poisoned, { readonly x: "number" } | { readonly x: 41 }>
>;

// 4 — validate with a PLAIN input parameter (safeParse's shape): inference
// is exact. The poison is the COMBINATION of validate with the deep
// deferred-conditional input, not validate itself — which is precisely
// why safeParse can validate schema leaves and parse/evaluate cannot.
declare function validatePlainInput<
  TInput extends string,
  const TSchema extends SchemaShape
>(
  input: TInput,
  schema: type.validate<TSchema>,
  values: NoInfer<type.infer<TSchema>>
): TSchema;
const clean = validatePlainInput("x+1", { x: "number" }, { x: 41 });
type _cleanExact = AssertTrue<
  AssertEqual<typeof clean, { readonly x: "number" }>
>;

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
