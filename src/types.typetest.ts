/**
 * Type-Level Tests
 *
 * Compile-time assertions for the type-level engine. This file is checked
 * by `pnpm typecheck` (tsc --noEmit) and excluded from the build — if it
 * compiles, the tests pass.
 *
 * The expected shapes here mirror the runtime assertions in
 * src/parser.test.ts — together they pin both engines to the same behavior.
 */

import type {
  ComputeGrammar,
  Context,
  InferValues,
  NumberNode,
  StringNode,
  PathNode,
  Parse,
  ResolvePath,
} from "./index.js";
import { defineNode, lhs, rhs, constVal, sameAs } from "./index.js";
import {
  add,
  div,
  eq,
  fixtureNodes,
  fixtureParser,
  formSchema,
  mul,
  numberLit,
  parens,
  pow,
  stringLit,
  sub,
  ternary,
  variable,
} from "./__fixtures__/grammar.js";

// =============================================================================
// Assertion helpers
// =============================================================================

type AssertEqual<T, Expected> = T extends Expected
  ? Expected extends T
    ? true
    : false
  : false;

type AssertExtends<T, Base> = T extends Base ? true : false;

// =============================================================================
// Fixtures
// =============================================================================

type G = ComputeGrammar<typeof fixtureNodes>;
type EmptyCtx = Context<{}>;
type FormCtx = Context<typeof formSchema>;

// =============================================================================
// ComputeGrammar (hotscript-free, digit-wise precedence comparison)
// =============================================================================

// Levels sorted ascending by precedence, atoms last, definition order kept
type TG1 = AssertEqual<
  G,
  [
    [typeof ternary],
    [typeof eq],
    [typeof add, typeof sub],
    [typeof mul, typeof div],
    [typeof pow],
    [typeof numberLit, typeof stringLit, typeof variable, typeof parens]
  ]
>;
const _tg1: TG1 = true;

// Precedences beyond the old ~999 tuple ceiling compare fine (digit-wise Lte)
{
  const n = defineNode({ name: "n", pattern: [], precedence: "atom" });
  const lo = defineNode({
    name: "lo",
    pattern: [lhs().as("l"), constVal("!"), rhs().as("r")],
    precedence: 100,
    resultType: "number",
  });
  const hi = defineNode({
    name: "hi",
    pattern: [lhs().as("l"), constVal("!!"), rhs().as("r")],
    precedence: 1500,
    resultType: "number",
  });
  type BigG = ComputeGrammar<readonly [typeof n, typeof hi, typeof lo]>;
  const _big: AssertEqual<
    BigG,
    [[typeof lo], [typeof hi], [typeof n]]
  > = true;
}

// =============================================================================
// Atoms
// =============================================================================

type A1 = AssertEqual<Parse<G, "42", EmptyCtx>, [NumberNode<"42">, ""]>;
const _a1: A1 = true;

type A2 = AssertEqual<Parse<G, "'hello'", EmptyCtx>, [StringNode<"hello">, ""]>;
const _a2: A2 = true;

// Identifiers parse as single-segment paths, resolved from the schema
type A3 = AssertEqual<Parse<G, "x", FormCtx>, [PathNode<["x"], "number">, ""]>;
const _a3: A3 = true;

type A4 = AssertEqual<Parse<G, "nope", EmptyCtx>, [PathNode<["nope"], "unknown">, ""]>;
const _a4: A4 = true;

// =============================================================================
// Precedence
// =============================================================================

interface Bin<TName extends string, TOut extends string, TLeft, TRight> {
  readonly node: TName;
  readonly outputSchema: TOut;
  left: TLeft;
  right: TRight;
}

type P1 = AssertEqual<
  Parse<G, "1+2*3", EmptyCtx>,
  [
    Bin<"add", "number", NumberNode<"1">, Bin<"mul", "number", NumberNode<"2">, NumberNode<"3">>>,
    ""
  ]
>;
const _p1: P1 = true;

type P2 = AssertEqual<
  Parse<G, "1*3+2", EmptyCtx>,
  [
    Bin<"add", "number", Bin<"mul", "number", NumberNode<"1">, NumberNode<"3">>, NumberNode<"2">>,
    ""
  ]
>;
const _p2: P2 = true;

// =============================================================================
// Associativity
// =============================================================================

// Left: 5-2-1 → sub(sub(5,2),1)
type S1 = AssertEqual<
  Parse<G, "5-2-1", EmptyCtx>,
  [
    Bin<"sub", "number", Bin<"sub", "number", NumberNode<"5">, NumberNode<"2">>, NumberNode<"1">>,
    ""
  ]
>;
const _s1: S1 = true;

// Left, mixed ops at one level: 1-2+3 → add(sub(1,2),3)
type S2 = AssertEqual<
  Parse<G, "1-2+3", EmptyCtx>,
  [
    Bin<"add", "number", Bin<"sub", "number", NumberNode<"1">, NumberNode<"2">>, NumberNode<"3">>,
    ""
  ]
>;
const _s2: S2 = true;

// Right: 2^3^2 → pow(2, pow(3,2))
type S3 = AssertEqual<
  Parse<G, "2^3^2", EmptyCtx>,
  [
    Bin<"pow", "number", NumberNode<"2">, Bin<"pow", "number", NumberNode<"3">, NumberNode<"2">>>,
    ""
  ]
>;
const _s3: S3 = true;

// =============================================================================
// Polymorphic nodes (union + sameAs + fromBinding)
// =============================================================================

// add derives its output type per parse
type PM1 = AssertEqual<
  Parse<G, "1+2", EmptyCtx>,
  [Bin<"add", "number", NumberNode<"1">, NumberNode<"2">>, ""]
>;
const _pm1: PM1 = true;

type PM2 = AssertEqual<
  Parse<G, "'a'+'b'", EmptyCtx>,
  [Bin<"add", "string", StringNode<"a">, StringNode<"b">>, ""]
>;
const _pm2: PM2 = true;

// sameAs rejects mixed operands at the type level too
type PM3 = AssertEqual<Parse<G, "1+'a'", EmptyCtx>, [NumberNode<"1">, "+'a'"]>;
const _pm3: PM3 = true;

// parens are polymorphic via fromBinding
type PM4 = Parse<G, "('a')", EmptyCtx>[0];
const _pm4: PM4 extends { node: "parens"; outputSchema: "string" } ? true : false =
  true;

// ternary derives its result type from the branches
type PM5 = Parse<G, "1==2 ? 3 : 4", EmptyCtx>[0];
const _pm5: PM5 extends { node: "ternary"; outputSchema: "number" } ? true : false =
  true;

type PM6 = Parse<G, "1==2 ? 'yes' : 'no'", EmptyCtx>[0];
const _pm6: PM6 extends { node: "ternary"; outputSchema: "string" } ? true : false =
  true;

// disagreeing ternary branches are rejected (parse stops at the eq)
type PM7 = Parse<G, "1==1 ? 1 : 'no'", EmptyCtx>;
const _pm7: PM7 extends [{ node: "eq" }, string] ? true : false = true;

// =============================================================================
// Member access (paths)
// =============================================================================

type M1 = AssertEqual<
  Parse<G, "values.password", FormCtx>,
  [PathNode<["values", "password"], "string">, ""]
>;
const _m1: M1 = true;

// The headline use case
type M2Root = Parse<G, "values.password == values.confirmPassword", FormCtx>[0];
type M2 = AssertExtends<
  M2Root,
  {
    node: "eq";
    outputSchema: "boolean";
    left: PathNode<["values", "password"], "string">;
    right: PathNode<["values", "confirmPassword"], "string">;
  }
>;
const _m2: M2 = true;

// Unknown segment resolves to "unknown"
type M3 = AssertEqual<
  Parse<G, "values.nope", FormCtx>,
  [PathNode<["values", "nope"], "unknown">, ""]
>;
const _m3: M3 = true;

// Bare identifier for a nested record resolves to "unknown"
type M4 = AssertEqual<Parse<G, "values", FormCtx>, [PathNode<["values"], "unknown">, ""]>;
const _m4: M4 = true;

// Whitespace rules (mirror the runtime):
// space AFTER a dot fails the element → no parse at all
type M5 = AssertEqual<Parse<G, "values. password", FormCtx>, []>;
const _m5: M5 = true;

// space BEFORE a dot ends the path (partial parse, trailing input)
type M6 = AssertEqual<
  Parse<G, "values .password", FormCtx>,
  [PathNode<["values"], "unknown">, " .password"]
>;
const _m6: M6 = true;

// dangling dot fails the element
type M7 = AssertEqual<Parse<G, "values.", FormCtx>, []>;
const _m7: M7 = true;

// ResolvePath directly
type R1 = AssertEqual<ResolvePath<typeof formSchema, ["values", "password"]>, "string">;
const _r1: R1 = true;
type R2 = AssertEqual<ResolvePath<typeof formSchema, ["x", "nope"]>, "unknown">;
const _r2: R2 = true;

// =============================================================================
// Failure cases
// =============================================================================

type F1 = AssertEqual<Parse<G, "@invalid", EmptyCtx>, []>;
const _f1: F1 = true;

// =============================================================================
// parse() input validation
// =============================================================================

// @ts-expect-error - invalid literals are rejected at compile time
fixtureParser.parse("@invalid", {});

// @ts-expect-error - partial parses are rejected at compile time
fixtureParser.parse("1+2 junk", {});

// @ts-expect-error - dynamic strings must use safeParse
fixtureParser.parse("1+2" as string, {});

// @ts-expect-error - mixed operand types are rejected at compile time
fixtureParser.parse("1+'a'", {});

// trailing whitespace is fine (matches safeParse)
fixtureParser.parse("1+2 ", {});

// =============================================================================
// Schema vocabulary validation (compile time)
// =============================================================================

// @ts-expect-error - 'numbr' is not in the grammar's type vocabulary
fixtureParser.safeParse("x", { x: "numbr" });

// @ts-expect-error - nested leaves are checked too
fixtureParser.safeParse("x", { a: { b: "numbr" } });

fixtureParser.safeParse("x", { x: "number" }); // ok
fixtureParser.safeParse("x", { a: { b: "string" } }); // ok

// =============================================================================
// evaluate() result types
// =============================================================================

const evalNum = fixtureParser.evaluate("1+2", {}, {});
const _e1: AssertEqual<typeof evalNum, number> = true;

const evalStr = fixtureParser.evaluate("'a'+'b'", {}, {});
const _e2: AssertEqual<typeof evalStr, string> = true;

const evalTernary = fixtureParser.evaluate("1==2 ? 'yes' : 'no'", {}, {});
const _e3: AssertEqual<typeof evalTernary, string> = true;

const evalBool = fixtureParser.evaluate(
  "values.password == values.confirmPassword",
  formSchema,
  { x: 0, values: { password: "a", confirmPassword: "b" } }
);
const _e4: AssertEqual<typeof evalBool, boolean> = true;

// InferValues maps schemas to runtime value shapes
type V1 = AssertEqual<
  InferValues<typeof formSchema>,
  {
    readonly x: number;
    readonly values: {
      readonly password: string;
      readonly confirmPassword: string;
    };
  }
>;
const _v1: V1 = true;

// =============================================================================
// eval binding types
// =============================================================================

// Union constraints and resolved sameAs flow into eval's parameter types;
// lazy nodes receive thunks.
defineNode({
  name: "check",
  pattern: [
    lhs(["number", "string"]).as("left"),
    constVal("~"),
    rhs(sameAs("left")).as("right"),
  ],
  precedence: 1,
  resultType: "boolean",
  lazy: true,
  eval: ({ left, right }) => {
    const _l: () => number | string = left;
    const _r: () => number | string = right;
    return left() === right();
  },
});

// =============================================================================
// Recursion canary
// =============================================================================

// Left-associative chains use a tail-recursive fold: 30 terms must compile.
// (The pre-rewrite engine hit TS2589 at ~20 terms.)
type Canary = Parse<
  G,
  "1+2+3+4+5+6+7+8+9+10+11+12+13+14+15+16+17+18+19+20+21+22+23+24+25+26+27+28+29+30",
  EmptyCtx
>;
type CanaryCheck = Canary extends [{ node: "add"; outputSchema: "number" }, ""]
  ? true
  : false;
const _canary: CanaryCheck = true;

export {};
