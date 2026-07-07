/**
 * Type-Level Tests (v2)
 *
 * Compile-time assertions checked by `pnpm typecheck` (tsc --noEmit) and
 * excluded from the build — if it compiles, the tests pass.
 *
 * The expected shapes here mirror the runtime assertions in
 * src/parser.test.ts — together they pin both engines to the same
 * behavior. Note: type-level outputSchema carries the DEF as written
 * ("number", a binding's resolved def), while the runtime displays
 * arktype's normalized expression — parity is over accept/reject and
 * inferred TS types, not display strings.
 */

import type { type } from "arktype";
import type {
  ComputeGrammar,
  Context,
  InferValues,
  InferEvaluatedBindings,
  Parse,
  Thunked,
} from "./index.js";
import { defineNode, lhs, rhs, expr, constVal } from "./index.js";
import { add, fixtureNodes, fixtureParser, formSchema, ternary } from "./__fixtures__/grammar.js";

// =============================================================================
// Assertion helpers
// =============================================================================

type AssertEqual<T, Expected> = [T] extends [Expected]
  ? [Expected] extends [T]
    ? true
    : false
  : false;

type AssertTrue<T extends true> = T;
type AssertExtends<T, Base> = T extends Base ? true : false;

type G = ComputeGrammar<typeof fixtureNodes>;
type EmptyCtx = Context<{}>;
type FormCtx = Context<typeof formSchema>;

// =============================================================================
// Literal-mode parsing: shapes
// =============================================================================

type PNum = Parse<G, "1", EmptyCtx>;
type _p1 = AssertTrue<
  AssertExtends<PNum, [{ node: "literal"; value: 1; outputSchema: "number" }, ""]>
>;

type PAdd = Parse<G, "1+2", EmptyCtx>;
type _p2 = AssertTrue<
  AssertExtends<
    PAdd,
    [
      {
        node: "add";
        outputSchema: "number";
        left: { value: 1 };
        right: { value: 2 };
      },
      ""
    ]
  >
>;

// string overload: same node, derived string type
type PConcat = Parse<G, "'a'+'b'", EmptyCtx>;
type _p3 = AssertTrue<
  AssertExtends<PConcat, [{ node: "add"; outputSchema: "string" }, ""]>
>;

// =============================================================================
// Precedence & associativity
// =============================================================================

// left fold: 10-5-2 = (10-5)-2
type PSub = Parse<G, "10-5-2", EmptyCtx>;
type _p4 = AssertTrue<
  AssertExtends<
    PSub,
    [
      {
        node: "sub";
        left: { node: "sub"; left: { value: 10 }; right: { value: 5 } };
        right: { value: 2 };
      },
      ""
    ]
  >
>;

// right recursion: 2^3^2 = 2^(3^2)
type PPow = Parse<G, "2^3^2", EmptyCtx>;
type _p5 = AssertTrue<
  AssertExtends<
    PPow,
    [
      {
        node: "pow";
        left: { value: 2 };
        right: { node: "pow"; left: { value: 3 }; right: { value: 2 } };
      },
      ""
    ]
  >
>;

// precedence: 1+2*3 = 1+(2*3)
type PPrec = Parse<G, "1+2*3", EmptyCtx>;
type _p6 = AssertTrue<
  AssertExtends<
    PPrec,
    [{ node: "add"; left: { value: 1 }; right: { node: "mul" } }, ""]
  >
>;

// parens reset precedence: (1+2)*3
type PParens = Parse<G, "(1+2)*3", EmptyCtx>;
type _p7 = AssertTrue<
  AssertExtends<
    PParens,
    [{ node: "mul"; left: { node: "parens"; inner: { node: "add" } } }, ""]
  >
>;

// =============================================================================
// Ternary: lazy, polymorphic via binding references
// =============================================================================

type PTern = Parse<G, "1==1 ? 1 : 2", EmptyCtx>;
type _t1 = AssertTrue<
  AssertExtends<PTern, [{ node: "ternary"; outputSchema: "number" }, ""]>
>;

type PTernStr = Parse<G, "1==1 ? 'a' : 'b'", EmptyCtx>;
type _t2 = AssertTrue<
  AssertExtends<PTernStr, [{ node: "ternary"; outputSchema: "string" }, ""]>
>;

// non-boolean condition rejected
type PTernBad = Parse<G, "1 ? 1 : 2", EmptyCtx>;
type _t3 = AssertTrue<AssertEqual<PTernBad extends [unknown, ""] ? true : false, false>>;

// disagreeing branches rejected (string ⊄ number)
type PTernMix = Parse<G, "1==1 ? 1 : 'a'", EmptyCtx>;
type _t4 = AssertTrue<AssertEqual<PTernMix extends [unknown, ""] ? true : false, false>>;

// =============================================================================
// Constraints: assignability & overlap
// =============================================================================

// mixed add rejected: 'a' ⊄ number (binding reference)
type PMixed = Parse<G, "1+'a'", EmptyCtx>;
type _c1 = AssertTrue<AssertEqual<PMixed extends [unknown, ""] ? true : false, false>>;

// overlapping eq: both operand orders parse for a union-typed identifier
type UnionCtx = Context<{ x: "string | number" }>;
type PEq1 = Parse<G, "x == 1", UnionCtx>;
type _c2 = AssertTrue<AssertExtends<PEq1, [{ node: "eq"; outputSchema: "boolean" }, string]>>;
type PEq2 = Parse<G, "1 == x", UnionCtx>;
type _c3 = AssertTrue<AssertExtends<PEq2, [{ node: "eq" }, string]>>;

// disjoint eq rejected
type PEqBad = Parse<G, "1 == 'a'", EmptyCtx>;
type _c4 = AssertTrue<AssertEqual<PEqBad extends [unknown, ""] ? true : false, false>>;

// refinement erasure: refined schema leaf usable where base is required
type PRefined = Parse<G, "age + 1", Context<{ age: "number > 0" }>>;
type _c5 = AssertTrue<AssertExtends<PRefined, [{ node: "add" }, ""]>>;

// unknown identifiers rejected by constrained slots
type PUnknownIdent = Parse<G, "nope + 1", EmptyCtx>;
type _c6 = AssertTrue<
  AssertEqual<PUnknownIdent extends [{ node: "add" }, ""] ? true : false, false>
>;

// =============================================================================
// Paths & schemas
// =============================================================================

type PPath = Parse<G, "values.password == values.confirmPassword", FormCtx>;
type _s1 = AssertTrue<AssertExtends<PPath, [{ node: "eq"; outputSchema: "boolean" }, ""]>>;

type PPathNode = Parse<G, "values.password", FormCtx>;
type _s2 = AssertTrue<
  AssertExtends<PPathNode, [{ node: "path"; path: ["values", "password"]; outputSchema: "string" }, ""]>
>;

// bare identifier for a nested record resolves to the record def
type PBare = Parse<G, "values", FormCtx>;
type _s3 = AssertTrue<
  AssertExtends<
    PBare,
    [{ node: "path"; outputSchema: { password: "string"; confirmPassword: "string" } }, ""]
  >
>;

// schema value inference
type _s4 = AssertTrue<
  AssertEqual<
    InferValues<typeof formSchema>,
    { x: number; values: { password: string; confirmPassword: string } }
  >
>;

// =============================================================================
// parse()/evaluate() call-site typing
// =============================================================================

const okTuple = fixtureParser.parse("1+2", {});
type _api1 = AssertTrue<AssertExtends<(typeof okTuple)[0], { node: "add" }>>;

const evalNum = fixtureParser.evaluate("1+2*3", {}, {});
type _api2 = AssertTrue<AssertEqual<typeof evalNum, number>>;

const evalBool = fixtureParser.evaluate("x == 1", { x: "number" }, { x: 1 });
type _api3 = AssertTrue<AssertEqual<typeof evalBool, boolean>>;

// invalid literals are compile errors
// @ts-expect-error — unparseable input
fixtureParser.parse("1 +", {});
// @ts-expect-error — trailing junk
fixtureParser.parse("1+2 junk", {});
// @ts-expect-error — type mismatch inside the expression
fixtureParser.parse("1 + 'a'", {});
// @ts-expect-error — dynamic strings must use safeParse
fixtureParser.parse("1+2" as string, {});
// @ts-expect-error — values must match the schema
fixtureParser.evaluate("x == 1", { x: "number" }, { x: "no" });

// =============================================================================
// Eval binding inference (Phase 1 assertions, still pinned)
// =============================================================================

type AddBindings = InferEvaluatedBindings<(typeof add)["pattern"]>;
type _b1 = AssertTrue<
  AssertEqual<AddBindings, { left: string | number; right: string | number }>
>;

type TernaryBindings = Thunked<InferEvaluatedBindings<(typeof ternary)["pattern"]>>;
type _b2 = AssertTrue<AssertEqual<TernaryBindings["cond"], () => boolean>>;

const _badReturn = defineNode({
  name: "badReturn",
  pattern: [lhs("number").as("a"), constVal("!"), rhs("number").as("b")],
  precedence: 1,
  resultType: "boolean",
  // @ts-expect-error — eval must return boolean, not number
  eval: ({ a, b }) => a + b,
});

const _refReturn = defineNode({
  name: "refReturn",
  pattern: [constVal("("), expr("number").as("inner"), constVal(")")],
  precedence: 1,
  resultType: "inner",
  // @ts-expect-error — eval must return inner's type (number), not string
  eval: ({ inner }) => String(inner),
});

const _objReturn = defineNode({
  name: "range",
  pattern: [lhs("number").as("min"), constVal(".."), rhs("number").as("max")],
  precedence: 1,
  resultType: { min: "number", max: "number" },
  eval: ({ min, max }) => ({ min, max }),
});

// object resultTypes flow through evaluateAst
declare const rangeAst: { node: "range"; outputSchema: { min: "number"; max: "number" } };
const rangeVal = fixtureParser.evaluateAst(rangeAst, {});
type _o1 = AssertTrue<AssertEqual<typeof rangeVal, { min: number; max: number }>>;

// =============================================================================
// Recursion canaries — pin the measured type-level floors. If a change
// breaks one of these, literal-mode capacity regressed.
// =============================================================================

// left-assoc chains are folded tail-recursively: 30 terms
type Chain30 = Parse<
  G,
  "1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1",
  EmptyCtx
>;
type _r1 = AssertTrue<AssertExtends<Chain30, [{ node: "add" }, ""]>>;

// nested parens: 3 deep
type Nested3 = Parse<G, "(((1)))", EmptyCtx>;
type _r2 = AssertTrue<AssertExtends<Nested3, [{ node: "parens" }, ""]>>;

// right-assoc pow chain: 8 terms
type Pow8 = Parse<G, "2^2^2^2^2^2^2^2", EmptyCtx>;
type _r3 = AssertTrue<AssertExtends<Pow8, [{ node: "pow" }, ""]>>;

// mixed real-world shape
type Real = Parse<
  G,
  "values.password == values.confirmPassword ? 1+2*3 : 10-5-2",
  FormCtx
>;
type _r4 = AssertTrue<AssertExtends<Real, [{ node: "ternary"; outputSchema: "number" }, ""]>>;
