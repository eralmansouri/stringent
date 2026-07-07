/**
 * Type-Level Tests (v2 — Phase 1 scope)
 *
 * Compile-time assertions checked by `pnpm typecheck` (tsc --noEmit) and
 * excluded from the build — if it compiles, the tests pass.
 *
 * Covered now: schema value inference (arktype type.infer), eval binding
 * inference (binding-reference constraints, union defs, thunks for lazy
 * nodes), and eval-return verification against declared resultTypes.
 *
 * TODO(Phase 3): literal-mode Parse<> assertions, ValidatedInput
 * rejections, and the recursion canaries return with the rebuilt
 * type-level engine (see V2-PLAN.md).
 * TODO(Phase 4): correlated (distributed-union) binding assertions.
 */

import type { InferValues, InferEvaluatedBindings, Thunked } from "./index.js";
import { defineNode, lhs, rhs, expr, constVal } from "./index.js";
import { add, ternary, formSchema } from "./__fixtures__/grammar.js";

// =============================================================================
// Assertion helpers
// =============================================================================

type AssertEqual<T, Expected> = T extends Expected
  ? Expected extends T
    ? true
    : false
  : false;

type AssertTrue<T extends true> = T;

// =============================================================================
// Schema value inference (arktype-backed)
// =============================================================================

type FormValues = InferValues<typeof formSchema>;
type _schema1 = AssertTrue<
  AssertEqual<
    FormValues,
    { x: number; values: { password: string; confirmPassword: string } }
  >
>;

type Refined = InferValues<{ age: "number > 0"; email: "string.email" }>;
// refinements erase to their base TS types
type _schema2 = AssertTrue<AssertEqual<Refined, { age: number; email: string }>>;

// =============================================================================
// Eval binding inference
// =============================================================================

// Union-constrained operand with a binding-reference tail: both bindings
// get the union type (correlation lands in Phase 4).
type AddBindings = InferEvaluatedBindings<(typeof add)["pattern"]>;
type _bindings1 = AssertTrue<
  AssertEqual<AddBindings, { left: string | number; right: string | number }>
>;

// Lazy nodes receive thunks
type TernaryBindings = Thunked<
  InferEvaluatedBindings<(typeof ternary)["pattern"]>
>;
type _bindings2 = AssertTrue<
  AssertEqual<TernaryBindings["cond"], () => boolean>
>;

// Static arktype defs infer directly
const _cmp = defineNode({
  name: "cmp",
  pattern: [lhs("number").as("a"), constVal("<"), rhs("number").as("b")],
  precedence: 1,
  resultType: "boolean",
  eval: ({ a, b }) => {
    type _a = AssertTrue<AssertEqual<typeof a, number>>;
    type _b = AssertTrue<AssertEqual<typeof b, number>>;
    return a < b;
  },
});

// =============================================================================
// Eval return verification against resultType
// =============================================================================

// resultType "boolean" with an eval returning number is a compile error
const _badReturn = defineNode({
  name: "badReturn",
  pattern: [lhs("number").as("a"), constVal("!"), rhs("number").as("b")],
  precedence: 1,
  resultType: "boolean",
  // @ts-expect-error — eval must return boolean, not number
  eval: ({ a, b }) => a + b,
});

// binding-reference resultType: eval must return the binding's type
const _refReturn = defineNode({
  name: "refReturn",
  pattern: [
    constVal("("),
    expr("number").as("inner"),
    constVal(")"),
  ],
  precedence: 1,
  resultType: "inner",
  // @ts-expect-error — eval must return inner's type (number), not string
  eval: ({ inner }) => String(inner),
});

// object resultTypes infer through type.infer
const _objReturn = defineNode({
  name: "range",
  pattern: [lhs("number").as("min"), constVal(".."), rhs("number").as("max")],
  precedence: 1,
  resultType: { min: "number", max: "number" },
  eval: ({ min, max }) => ({ min, max }),
});
