/**
 * Executable demonstrations of every runtime-observable claim, limit, and
 * odd behavior stated in DESIGN.md. Each describe() names the DESIGN.md
 * section it pins; the snippets printed there are these tests, verbatim
 * or lightly trimmed. If a claim in the document cannot be demonstrated
 * here (or in design-claims.typetest.ts for compile-time claims), it does
 * not belong in the document.
 */

import { describe, expect, it } from "vitest";
import { type } from "arktype";
import { match } from "arktype";
import {
  type PatternBuilder,
  EvaluationError,
  StringentParseError,
  createParser,
  defineNode,
} from "./index.js";
import { fixtureParser as parser, formSchema } from "./__fixtures__/grammar.js";

describe("DESIGN: validation layers — schema typos", () => {
  it("a typo'd schema leaf throws at runtime when the compile-time check is bypassed", () => {
    // every entry point carries type.validate now (leaf typos are compile
    // errors — see design-claims.typetest.ts); the casts bypass it to
    // exercise the runtime check that protects plain-JS callers:
    expect(() => {
      parser.evaluate("1+1" as never, { x: "numbr" } as never, { x: 1 } as never);
    }).toThrow(/invalid schema/);
  });

  it("a typo'd constraint is a construction error, not a dead grammar rule", () => {
    // operand("nmbr") is a COMPILE error at the chained call (pinned in
    // design-claims.typetest.ts); the cast exercises the construction
    // check that protects plain-JS users
    const typo = defineNode({
      name: "typo",
      precedence: 1,
      pattern: ((p: PatternBuilder) =>
        p
          .operand("numbr" as never).as("a")
          .constVal("!")
          .rest("number").as("b")
          .result("number")) as never,
    });
    expect(() => {
      createParser([typo] as const);
    }).toThrow(/'numbr'/);
  });
});

describe("DESIGN: 'unknown' identifiers", () => {
  it("constrained slots reject unknown identifiers with a named TYPE_MISMATCH", () => {
    const result = parser.safeParse("1 + zz", {});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("TYPE_MISMATCH");
      expect(result.error.message).toContain("'zz'");
    }
  });

  it("…but position matters: an unknown LEADING a left-fold level reads as UNEXPECTED_INPUT", () => {
    // `zz` parses fine on its own (a bare path); the fold then checks it
    // against add's leading constraint, fails, and never starts — so the
    // parse "succeeds" on the prefix `zz` and trips over the leftover
    // "+ 1" instead of reporting the constraint. Same rejection, blunter
    // message. (Discovered writing this file; candidate for the ranking
    // improvements tracked in the error model section.)
    const result = parser.safeParse("zz + 1", {});
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("UNEXPECTED_INPUT");
  });

  it("UNCONSTRAINED slots accept unknowns: `zz == yy` parses and only fails at evaluation", () => {
    // eq's left slot is operand() — unconstrained — and overlapping()
    // against an unknown is permissive, so this PARSES:
    const result = parser.safeParse("zz == yy", {});
    expect(result.success).toBe(true);
    // …and blows up only when evaluated:
    if (result.success) {
      expect(() => parser.evaluateAst(result.ast, {})).toThrow(
        "'zz' is not defined"
      );
    }
  });
});

describe("DESIGN: refinements are validation-only", () => {
  it("a refined schema leaf parses wherever its base type is accepted…", () => {
    // typing-wise `age` is just a number ("number > 0" erases), so this
    // parses — if parsing enforced refinements, `age + 1` would need a
    // refinement-preserving arithmetic no type system has
    const result = parser.safeParse("age + 1", { age: "number > 0" });
    expect(result.success).toBe(true);
  });

  it("…and the refinement does its real job at the VALUES boundary", () => {
    expect(parser.evaluate("age + 1", { age: "number > 0" }, { age: 41 })).toBe(42);
    expect(() => {
      parser.evaluate("age + 1", { age: "number > 0" }, { age: -5 });
    }).toThrow(/positive|must be/);
  });
});

describe("DESIGN: eval typing — flat bindings + match", () => {
  it("eval receives THUNKS, so a bare arktype matcher cannot be an eval: evaluate the bindings, then match", () => {
    // (see also the arktype-generics alternative pinned below)
    const matcher = match
      .in<{ l: number | string; r: number | string }>()
      .case({ l: "number", r: "number" }, (b) => b.l + b.r)
      .case({ l: "string", r: "string" }, (b) => b.l + b.r)
      .default("assert");

    const num = defineNode({
      name: "n",
      precedence: 2,
      pattern: (p) => p.number(),
    });
    const bare = defineNode({
      name: "bare",
      precedence: 1,
      pattern: (p) =>
        p
          .operand("number | string").as("l")
          .constVal("&")
          .operand("l").as("r")
          .result("l")
          .eval(matcher as never), // ✗ bindings are thunks; no case matches
    });
    const wrapped = defineNode({
      name: "bare",
      precedence: 1,
      pattern: (p) =>
        p
          .operand("number | string").as("l")
          .constVal("&")
          .operand("l").as("r")
          .result("l")
          .eval((b) => matcher({ l: b.l(), r: b.r() })), // ✓ evaluate, then match
    });

    expect(() => {
      createParser([num, bare] as const).evaluate("1 & 2", {}, {});
    }).toThrow(); // .default("assert") rejects thunk-shaped input
    expect(createParser([num, wrapped] as const).evaluate("1 & 2", {}, {})).toBe(3);
  });

  it("arktype GENERICS are an alternative correlated-pair guard", () => {
    // (owner suggestion, PR #7) — instead of enumerating match cases, a
    // generic type expresses "both sides are the same t" once and
    // instantiates per member; eval picks the instantiation and lets the
    // Type validate the correlated pair:
    const samePair = type("<t extends string | number>", { l: "t", r: "t" });
    const numPair = samePair("number");
    const strPair = samePair("string");

    expect(numPair({ l: 1, r: 2 }) instanceof type.errors).toBe(false);
    expect(strPair({ l: "a", r: "b" }) instanceof type.errors).toBe(false);
    // a mixed pair fails the instantiated Type — same backstop role as
    // match's .default("assert"), with the correlation stated ONCE
    expect(numPair({ l: 1, r: "x" }) instanceof type.errors).toBe(true);
  });

  it("flat bindings are honest: values may straddle the accepted combinations at runtime", () => {
    // x parses AS "string | number", so both slots accept `x + 1` — but at
    // runtime x may hold a string while the right operand is a number. The
    // fixture's match eval uses .default('assert'), so this throws instead
    // of silently computing "hi1":
    expect(() => {
      parser.evaluate("x + 1", { x: "string | number" }, { x: "hi" });
    }).toThrow();
    expect(parser.evaluate("x + 1", { x: "string | number" }, { x: 1 })).toBe(2);
  });
});

describe("DESIGN: parsing model — associativity by tail shape", () => {
  it("same tokens, different tail role, different math", () => {
    // the fixture's sub has an operand() tail → left fold → (10-5)-2
    expect(parser.evaluate("10-5-2", {}, {})).toBe(3);

    // an otherwise-identical sub with a rest() tail recurses right:
    const num = defineNode({
      name: "n",
      precedence: 2,
      pattern: (p) => p.number(),
    });
    const subR = defineNode({
      name: "subR",
      precedence: 1,
      pattern: (p) =>
        p
          .operand("number").as("l")
          .constVal("-")
          .rest("number").as("r")
          .result("number")
          .eval(({ l, r }) => l() - r()),
    });
    const right = createParser([num, subR] as const);
    expect(right.evaluate("10-5-2", {}, {})).toBe(7); // 10-(5-2)
  });

  it("mixing tail shapes within one precedence level is a construction error", () => {
    const num = defineNode({
      name: "n",
      precedence: 2,
      pattern: (p) => p.number(),
    });
    const left = defineNode({
      name: "l",
      precedence: 1,
      pattern: (p) =>
        p
          .operand("number").as("a")
          .constVal("+")
          .operand("number").as("b")
          .result("number"),
    });
    const right = defineNode({
      name: "r",
      precedence: 1,
      pattern: (p) =>
        p
          .operand("number").as("a")
          .constVal("-")
          .rest("number").as("b")
          .result("number"),
    });
    expect(() => {
      createParser([num, left, right] as const);
    }).toThrow(/mixes tail shapes/);
  });

  it("an undelimited expr() is a construction error (it would swallow looser operators)", () => {
    // If this compiled, `10 - 5 == 2` would parse as `10 - (5 == 2)`:
    // expr() resets to the FULL grammar, so with nothing bounding it, the
    // eq at a looser precedence gets consumed inside sub's operand.
    const num = defineNode({
      name: "n",
      precedence: 2,
      pattern: (p) => p.number(),
    });
    const bad = defineNode({
      name: "bad",
      precedence: 1,
      pattern: (p) =>
        p
          .operand("number").as("a")
          .constVal("-")
          .expr().as("b")
          .result("number"),
    });
    expect(() => {
      createParser([num, bad] as const);
    }).toThrow(/expr\(\) element with no constVal after it/);
  });
});

describe("DESIGN: identifier-like consts — word boundaries & alternation order", () => {
  it("identifier-like const values match WHOLE identifiers only", () => {
    // constVal("null") must not match the PREFIX of `nullable` — the
    // word-boundary rule. Without it, "nullable" would parse as the
    // keyword `null` followed by dangling text "able".
    const variable = defineNode({
      name: "var",
      precedence: 1,
      pattern: (p) => p.path(),
    });
    const nullLit = defineNode({
      name: "null",
      precedence: 1,
      pattern: (p) =>
        p
          .constVal("null")
          .result("null")
          .eval(() => null),
    });
    const p = createParser([nullLit, variable] as const);

    const keyword = p.safeParse("null", {});
    expect(keyword.success && keyword.ast).toMatchObject({
      node: "null",
      outputSchema: "null",
    });

    // `nullable` is ONE identifier — the null node never matches it
    const identifier = p.safeParse("nullable", { nullable: "number" });
    expect(identifier.success && identifier.ast).toMatchObject({
      node: "path",
      path: ["nullable"],
      outputSchema: "number",
    });

    // the rule also guards infix words: `andy` never matches constVal("and")
    const num = defineNode({
      name: "n",
      precedence: 2,
      pattern: (p) => p.number(),
    });
    const conj = defineNode({
      name: "and",
      precedence: 1,
      pattern: (p) =>
        p
          .operand("number").as("l")
          .constVal("and")
          .rest("number").as("r")
          .result("number")
          .eval(({ l, r }) => l() && r()),
    });
    const infix = createParser([num, conj] as const);
    expect(infix.safeParse("1 and 2", {}).success).toBe(true);
    expect(infix.safeParse("1 andy 2", {}).success).toBe(false);
  });

  it("UNIT keyword resultTypes work end-to-end (resultType 'true')", () => {
    // a node may mint an arktype unit keyword; it satisfies base-type slots
    const num = defineNode({
      name: "n",
      precedence: 2,
      pattern: (p) => p.number(),
    });
    const yes = defineNode({
      name: "yes",
      precedence: 2,
      pattern: (p) =>
        p
          .constVal("yes")
          .result("true")
          .eval(() => true as const),
    });
    const tern = defineNode({
      name: "tern",
      precedence: 1,
      pattern: (p) =>
        p
          .operand("boolean").as("cond")
          .constVal("?")
          .operand("number").as("then")
          .constVal(":")
          .rest("number").as("else")
          .result("number")
          .eval(({ cond, then, else: alt }) => (cond() ? then() : alt())),
    });
    const p = createParser([num, yes, tern] as const);
    const parsed = p.safeParse("yes ? 1 : 2", {});
    expect(parsed.success && parsed.ast).toMatchObject({ node: "tern" });
    expect(p.evaluate("yes ? 1 : 2", {}, {})).toBe(1);
  });

  it("const alternation: ONE node matches several keywords; members try in order", () => {
    // constVal("true", "false") is an ordered alternation — the named
    // element binds the MATCHED text, so one node covers both booleans:
    const num = defineNode({ name: "n", precedence: 2, pattern: (p) => p.number() });
    const boolLit = defineNode({
      name: "bool",
      precedence: 2,
      pattern: (p) =>
        p
          .constVal("true", "false").as("word")
          .result("boolean")
          .eval(({ word }) => word() === "true"),
    });
    const p = createParser([num, boolLit] as const);
    expect(p.evaluate("true", {}, {})).toBe(true);
    expect(p.evaluate("false", {}, {})).toBe(false);
    // word boundary holds PER MEMBER: `truex` is one identifier
    expect(p.safeParse("truex", {}).success).toBe(false);

    // members are tried IN ORDER — a prefix member declared first wins,
    // so list longer members first when they overlap:
    const eqFirst = defineNode({
      name: "op",
      precedence: 2,
      pattern: (p) => p.constVal("==", "=").as("op").result("string").eval(({ op }) => op()),
    });
    const eqLast = defineNode({
      name: "op",
      precedence: 2,
      pattern: (p) => p.constVal("=", "==").as("op").result("string").eval(({ op }) => op()),
    });
    const longestFirst = createParser([eqFirst] as const).safeParse("==", {});
    expect(longestFirst.success && longestFirst.ast).toMatchObject({
      op: { outputSchema: "==" },
    });
    const prefixFirst = createParser([eqLast] as const).safeParse("==", {});
    // "=" matched first, leaving "=" unconsumed → UNEXPECTED_INPUT
    expect(prefixFirst.success).toBe(false);
  });

  it("a path() node BEFORE a keyword const swallows `true` as an identifier", () => {
    const variable = defineNode({
      name: "var",
      precedence: 1,
      pattern: (p) => p.path(),
    });
    const boolLit = defineNode({
      name: "true",
      precedence: 1,
      pattern: (p) =>
        p
          .constVal("true")
          .result("boolean")
          .eval(() => true),
    });

    const keywordsFirst = createParser([boolLit, variable] as const);
    const variableFirst = createParser([variable, boolLit] as const);

    const good = keywordsFirst.safeParse("true", {});
    expect(good.success && good.ast).toMatchObject({
      node: "true",
      outputSchema: "boolean",
    });

    // same input, wrong order: `true` becomes an unresolved identifier
    const trap = variableFirst.safeParse("true", {});
    expect(trap.success && trap.ast).toMatchObject({
      node: "path",
      path: ["true"],
      outputSchema: "unknown",
    });
  });
});

describe("DESIGN: dual-engine divergences", () => {
  it("\\xHH / \\uHHHH escapes are runtime-only (literal mode rejects them — see typetest)", () => {
    const result = parser.safeParse('"\\x41\\u0042"', {});
    expect(result.success).toBe(true);
    if (result.success) expect(parser.evaluateAst(result.ast, {})).toBe("AB");
  });

  it("the overlap corner is NOT conservative: runtime rejects disjoint-prop objects the type level accepts", () => {
    // arktype: { v: string } and { v: number } are disjoint (no value
    // inhabits both) → the runtime rejects `a == b`.
    // TS: { v: string } & { v: number } = { v: never }, which is NOT never
    // → the type level accepts it (design-claims.typetest.ts pins that).
    // Consequence: parse("a == b", objSchema) compiles, then throws.
    expect(type({ v: "string" }).overlaps(type({ v: "number" }))).toBe(false);
    const objSchema = { a: { v: "string" }, b: { v: "number" } } as const;
    const result = parser.safeParse("a == b", objSchema);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("TYPE_MISMATCH");
    expect(() => {
      parser.parse("a == b" as never, objSchema);
    }).toThrow(StringentParseError);
  });

  it("wide (non-literal) schema types disable parse()'s compile-time guarantee", () => {
    // Record<string, "number"> makes the type engine resolve EVERY
    // identifier optimistically — `nope + 1` compiles (see typetest), and
    // the mistake surfaces as a runtime throw instead:
    const wide: Record<string, "number"> = {};
    expect(() => {
      parser.parse("nope + 1" as never, wide as never);
    }).toThrow(StringentParseError);
  });
});

describe("DESIGN: evaluation model — security", () => {
  it("prototype members never resolve: expressions are untrusted input", () => {
    expect(() => parser.evaluateAst(
      { node: "identifier", name: "constructor", outputSchema: "unknown" },
      {}
    )).toThrow("'constructor' is not defined");
    expect(() => parser.evaluateAst(
      { node: "path", path: ["x", "__proto__"], outputSchema: "unknown" },
      { x: {} }
    )).toThrow("'x.__proto__' is not defined");
  });
});

describe("review findings (Fable, 2026-07-07) — regression pins", () => {
  it("F1: morph-typed schema leaves cannot crash or corrupt the caches", () => {
    const f = type("string").pipe((s) => s.length);
    const g = type("string").pipe((s) => s + "!");
    const num = defineNode({
      name: "n",
      precedence: 2,
      pattern: (p) => p.number(),
    });
    const vary = defineNode({
      name: "v",
      precedence: 2,
      pattern: (p) => p.path(),
    });
    const coalesce = defineNode({
      name: "coalesce",
      precedence: 1,
      pattern: (p) =>
        p
          .operand().as("x")
          .constVal("??")
          .rest("x | null").as("y")
          .result("x")
          .eval(({ x }) => x() as never),
    });
    // distinct morphs share an .expression — before the fix, "a ?? a"
    // seeded the caches and "b ?? a" silently reused the verdict; on a
    // fresh parser "b ?? a" THREW out of safeParse instead
    const schema = { a: f, b: g } as never;
    const fresh = createParser([num, vary, coalesce] as const);
    expect(fresh.safeParse("b ?? a", schema).success).toBe(false); // no throw

    const seeded = createParser([num, vary, coalesce] as const);
    expect(seeded.safeParse("a ?? a", schema).success).toBe(true); // same morph: fine
    expect(seeded.safeParse("b ?? a", schema).success).toBe(false); // cache not fooled
  });

  it("F2: the '~resolved' carrier key is enforced as reserved", () => {
    const num = defineNode({
      name: "n",
      precedence: 2,
      pattern: (p) => p.number(),
    });
    const sneaky = defineNode({
      name: "sneaky",
      precedence: 1,
      pattern: (p) =>
        p
          .operand("number").as("a")
          .constVal("!")
          .rest("number").as("b")
          .result({ "~resolved": "number" } as never),
    });
    expect(() => {
      createParser([num, sneaky] as const);
    }).toThrow(/'~resolved' key .* reserved/);
  });

  it("F3: refinement-on-reference templates get an honest construction error", () => {
    const num = defineNode({
      name: "n",
      precedence: 2,
      pattern: (p) => p.number(),
    });
    // "left > 5" is a COMPILE error at the chained call — refinements on
    // an unknown-typed alias are rejected by arktype itself (pinned in
    // design-claims.typetest.ts); the cast exercises the runtime twin
    const refined = defineNode({
      name: "refined",
      precedence: 1,
      pattern: ((p: PatternBuilder) =>
        p
          .operand("number").as("left")
          .constVal("!")
          .rest("left > 5" as never).as("r")
          .result("number")) as never,
    });
    expect(() => {
      createParser([num, refined] as const);
    }).toThrow(/refinements must live on the referenced operand's own constraint/);
  });
});

describe("DESIGN: error model — known ranking weakness", () => {
  it("unclosed delimiters report a speculative constraint mismatch, not the missing ')'", () => {
    // The ternary probes whether `1` is boolean while parsing "(1"; that
    // mismatch span ties the real failure (missing ")") at end-of-input
    // and wins the ranking. Documented weakness — this test pins the
    // CURRENT (suboptimal) behavior so a future fix shows up as a diff:
    const result = parser.safeParse("(1", {});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("TYPE_MISMATCH"); // not PARSE_ERROR
      expect(result.error.message).toContain("boolean"); // the ternary's probe
    }
  });
});

describe("DESIGN: rules as arktype Types", () => {
  it("predicate rules attribute failures to a field path, keeping values out of messages", () => {
    const rule = parser.compile(
      "values.password == values.confirmPassword",
      formSchema,
      { path: ["values", "confirmPassword"], message: "passwords to match" }
    );
    const out = rule({
      x: 0,
      values: { password: "hunter2", confirmPassword: "oops" },
    });
    expect(out).toBeInstanceOf(type.errors);
    if (out instanceof type.errors) {
      expect(Object.keys(out.flatByPath)).toEqual(["values.confirmPassword"]);
      expect(out.summary).not.toContain("hunter2"); // secrets never leak
    }
  });

  it("predicate rules need the JSON Schema fallback (.in contains the predicate node)", () => {
    const rule = parser.compile(
      "values.password == values.confirmPassword",
      formSchema
    );
    expect(() => rule.in.toJsonSchema()).toThrow(); // ToJsonSchemaError
    expect(
      rule.in.toJsonSchema({ fallback: { predicate: (ctx) => ctx.base } })
    ).toMatchObject({ type: "object" });
  });
});
