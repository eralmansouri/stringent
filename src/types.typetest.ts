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
  InferOfDef,
  InferValues,
  InferEvaluatedBindings,
  Parse,
  Thunked,
} from "./index.js";
import {
  defineNode,
  operand,
  rest,
  expr,
  constVal,
  number,
  nullVal,
  string,
} from "./index.js";
import { add, eq, fixtureNodes, fixtureParser, formSchema, sub, ternary } from "./__fixtures__/grammar.js";

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
// Keyword literals & string escapes (Phase 5)
// =============================================================================

type PTrue = Parse<G, "true", EmptyCtx>;
type _k1 = AssertTrue<
  AssertExtends<PTrue, [{ node: "literal"; value: true; outputSchema: "boolean" }, ""]>
>;

type PNull = Parse<G, "null", EmptyCtx>;
type _k2 = AssertTrue<
  AssertExtends<PNull, [{ node: "literal"; value: null; outputSchema: "null" }, ""]>
>;

type PUndef = Parse<G, "undefined", EmptyCtx>;
type _k3 = AssertTrue<
  AssertExtends<PUndef, [{ node: "literal"; value: undefined; outputSchema: "undefined" }, ""]>
>;

// keyword-prefix guard: nullable is one identifier, not null + "able"
type PNullable = Parse<G, "nullable", Context<{ nullable: "number" }>>;
type _k4 = AssertTrue<
  AssertExtends<PNullable, [{ node: "path"; path: ["nullable"]; outputSchema: "number" }, ""]>
>;

// boolean literal satisfies ternary's cond constraint
type PTernKw = Parse<G, "true ? 1 : 2", EmptyCtx>;
type _k5 = AssertTrue<
  AssertExtends<PTernKw, [{ node: "ternary"; outputSchema: "number" }, ""]>
>;

// null does not satisfy a boolean slot
type PTernNull = Parse<G, "null ? 1 : 2", EmptyCtx>;
type _k6 = AssertTrue<AssertEqual<PTernNull extends [unknown, ""] ? true : false, false>>;

// null overlaps a nullable identifier in eq; disjoint from number
type PEqNull = Parse<G, "x == null", Context<{ x: "string | null" }>>;
type _k7 = AssertTrue<AssertExtends<PEqNull, [{ node: "eq"; outputSchema: "boolean" }, ""]>>;
type PEqNullBad = Parse<G, "1 == null", EmptyCtx>;
type _k8 = AssertTrue<AssertEqual<PEqNullBad extends [unknown, ""] ? true : false, false>>;

// escaped quote does NOT terminate the string; value is unescaped, raw keeps
// the source escapes ("'a\\'b'" below is the 7-char source 'a\'b')
type PEsc = Parse<G, "'a\\'b'", EmptyCtx>;
type _k9 = AssertTrue<
  AssertExtends<PEsc, [{ node: "literal"; raw: "a\\'b"; value: "a'b"; outputSchema: "string" }, ""]>
>;

type PEscNl = Parse<G, "'line1\\nline2'", EmptyCtx>;
type _k10 = AssertTrue<AssertExtends<PEscNl, [{ value: "line1\nline2" }, ""]>>;

// \xHH / \uHHHH are runtime-only (hex cannot be decoded at the type level):
// literal-mode parsing conservatively rejects them — use safeParse
type PEscHex = Parse<G, "'\\x41'", EmptyCtx>;
type _k11 = AssertTrue<AssertEqual<PEscHex extends [unknown, ""] ? true : false, false>>;

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
// Ternary: short-circuiting, polymorphic via binding references
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
// Embedded binding references (scoped defs; spike/union-defs)
// =============================================================================

const embNum = defineNode({ name: "num", pattern: [number()], precedence: 2 });
const embStr = defineNode({
  name: "str",
  pattern: [string(["'"])],
  precedence: 2,
});
const embNull = defineNode({
  name: "null",
  pattern: [nullVal()],
  precedence: 2,
});
const embMaybe = defineNode({
  name: "maybe",
  pattern: [operand("number | string | null").as("v"), constVal("?")],
  precedence: 1,
  resultType: "v | null",
  eval: ({ v }) => v as never,
});
const embPair = defineNode({
  name: "pair",
  pattern: [
    operand("number | string").as("l"),
    constVal("~"),
    rest("l | null").as("r"),
  ],
  precedence: 0,
  resultType: "boolean",
  eval: ({ l, r }) => l === r,
});
const embNodes = [embNum, embStr, embNull, embMaybe, embPair] as const;
type EmbG = ComputeGrammar<typeof embNodes>;

// template resultType resolves against the parsed operand; the AST carries
// a resolved-type CARRIER whose inferred type is exact
type PMaybe = Parse<EmbG, "1?", EmptyCtx>;
type _e1 = AssertTrue<AssertExtends<PMaybe, [{ node: "maybe" }, ""]>>;
type MaybeOut = PMaybe extends [{ outputSchema: infer O }, string]
  ? InferOfDef<O>
  : never;
type _e2 = AssertTrue<AssertEqual<MaybeOut, number | null>>;

// chained templates hit a fixed point (number | null | null normalizes) —
// the type set stays finite, so deep chains don't blow up (measured)
type PMaybe2 = Parse<EmbG, "1??", EmptyCtx>;
type Maybe2Out = PMaybe2 extends [{ outputSchema: infer O }, string]
  ? InferOfDef<O>
  : never;
type _e3 = AssertTrue<AssertEqual<Maybe2Out, number | null>>;

// template CONSTRAINTS: null ⊆ l | null with l: number …
type PPairNull = Parse<EmbG, "1 ~ null", EmptyCtx>;
type _e4 = AssertTrue<AssertExtends<PPairNull, [{ node: "pair" }, ""]>>;
// … but string is rejected
type PPairBad = Parse<EmbG, "1 ~ 'a'", EmptyCtx>;
type _e5 = AssertTrue<AssertEqual<PPairBad extends [unknown, ""] ? true : false, false>>;

// template results feed downstream checks: maybe's number | null satisfies
// pair's template on the right, but not its PLAIN left slot
type PPairChain = Parse<EmbG, "1 ~ 2?", EmptyCtx>;
type _e6 = AssertTrue<AssertExtends<PPairChain, [{ node: "pair" }, ""]>>;
type PPairChainBad = Parse<EmbG, "1? ~ 2", EmptyCtx>;
type _e7 = AssertTrue<
  AssertEqual<PPairChainBad extends [unknown, ""] ? true : false, false>
>;

// =============================================================================
// compile(): rule-as-Type call-site typing (Phase 6)
// =============================================================================

// predicate rule (boolean output): values in, values out
const pwRule = fixtureParser.compile(
  "values.password == values.confirmPassword",
  formSchema
);
const pwOut = pwRule({} as never);
type _cp1 = AssertTrue<
  AssertEqual<
    Exclude<typeof pwOut, type.errors>,
    InferValues<typeof formSchema>
  >
>;

// morph rule (non-boolean output): values in, evaluated result out
const morphRule = fixtureParser.compile("x * 2 + 1", { x: "number" });
const morphOut = morphRule({ x: 1 });
type _cp2 = AssertTrue<AssertEqual<Exclude<typeof morphOut, type.errors>, number>>;

// =============================================================================
// Eval binding inference (Phase 1 assertions, still pinned)
// =============================================================================

// Bindings are a FLAT per-binding map; reference-linked bindings resolve
// to the referenced operand's constraint type (no distributed union)
type AddBindings = InferEvaluatedBindings<(typeof add)["pattern"]>;
type _b1 = AssertTrue<
  AssertEqual<
    AddBindings,
    { left: string | number; right: string | number }
  >
>;

type TernaryBindings = Thunked<InferEvaluatedBindings<(typeof ternary)["pattern"]>>;
type _b2 = AssertTrue<AssertEqual<TernaryBindings["cond"], () => boolean>>;

// unconstrained root: single branch, same as before (eq's overlapping ref)
type EqBindings = InferEvaluatedBindings<(typeof eq)["pattern"]>;
type _b3 = AssertTrue<AssertEqual<EqBindings, { left: unknown; right: unknown }>>;

// unlinked patterns keep independent (non-union) bindings
type SubBindings = InferEvaluatedBindings<(typeof sub)["pattern"]>;
type _b4 = AssertTrue<AssertEqual<SubBindings, { left: number; right: number }>>;

// reference CHAINS resolve transitively to the root constraint's type:
// c references b references a, so all three carry a's def type
const _chain = defineNode({
  name: "chain3",
  pattern: [
    operand("number | string").as("a"),
    constVal("~"),
    operand("a").as("b"),
    constVal("~"),
    operand("b").as("c"),
  ],
  precedence: 1,
  resultType: "a",
  eval: (b) => b.a(),
});
type ChainBindings = InferEvaluatedBindings<(typeof _chain)["pattern"]>;
type _b5 = AssertTrue<
  AssertEqual<
    ChainBindings,
    { a: string | number; b: string | number; c: string | number }
  >
>;

// linked bindings on a non-union constraint resolve to that type
const _iff = defineNode({
  name: "iff",
  pattern: [operand("boolean").as("a"), constVal("<=>"), rest("a").as("b")],
  precedence: 1,
  resultType: "boolean",
  eval: (b) => b.a() === b.b(),
});
type IffBindings = InferEvaluatedBindings<(typeof _iff)["pattern"]>;
type _b6 = AssertTrue<AssertEqual<IffBindings, { a: boolean; b: boolean }>>;

// eval return is verified against resultType for reference-linked patterns
const _badLinked = defineNode({
  name: "badLinked",
  pattern: [operand("number | string").as("l"), constVal("&"), rest("l").as("r")],
  precedence: 1,
  resultType: "l",
  // @ts-expect-error — eval must return l's type (string | number), not boolean
  eval: (b) => b.l() === b.r(),
});

const _badReturn = defineNode({
  name: "badReturn",
  pattern: [operand("number").as("a"), constVal("!"), rest("number").as("b")],
  precedence: 1,
  resultType: "boolean",
  // @ts-expect-error — eval must return boolean, not number
  eval: ({ a, b }) => a() + b(),
});

const _refReturn = defineNode({
  name: "refReturn",
  pattern: [constVal("("), expr("number").as("inner"), constVal(")")],
  precedence: 1,
  resultType: "inner",
  // @ts-expect-error — eval must return inner's type (number), not string
  eval: ({ inner }) => String(inner()),
});

const _objReturn = defineNode({
  name: "range",
  pattern: [operand("number").as("min"), constVal(".."), rest("number").as("max")],
  precedence: 1,
  resultType: { min: "number", max: "number" },
  eval: ({ min, max }) => ({ min: min(), max: max() }),
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
