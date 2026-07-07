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
  EvaluationError,
  StringentParseError,
  boolean,
  constVal,
  createParser,
  defineNode,
  expr,
  number,
  operand,
  path,
  rest,
} from "./index.js";
import { fixtureParser as parser, formSchema } from "./__fixtures__/grammar.js";

describe("DESIGN: validation layers — schema typos", () => {
  it("a typo'd schema leaf on evaluate() is NOT a compile error, but throws at runtime", () => {
    // safeParse carries type.validate (leaf typos are compile errors there —
    // see design-claims.typetest.ts); evaluate cannot (inference poisoning),
    // so the same typo surfaces at runtime instead:
    expect(() => {
      parser.evaluate("1+1" as never, { x: "numbr" } as never, { x: 1 } as never);
    }).toThrow(/invalid schema/);
  });

  it("a typo'd constraint is a construction error, not a dead grammar rule", () => {
    const typo = defineNode({
      name: "typo",
      pattern: [operand("numbr").as("a"), constVal("!"), rest("number").as("b")],
      precedence: 1,
      resultType: "number",
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

describe("DESIGN: eval typing — correlated bindings", () => {
  it("a bare arktype matcher as eval crashes: eval's 2nd arg lands in arktype's context slot", () => {
    const addPattern = [
      operand("number | string").as("l"),
      constVal("&"),
      operand("l").as("r"),
    ] as const;
    const matcher = match
      .in<{ l: number; r: number } | { l: string; r: string }>()
      .case({ l: "number", r: "number" }, (b) => b.l + b.r)
      .case({ l: "string", r: "string" }, (b) => b.l + b.r)
      .default("assert");

    const num = defineNode({ name: "n", pattern: [number()], precedence: 2 });
    const bare = defineNode({
      name: "bare",
      pattern: addPattern,
      precedence: 1,
      resultType: "l",
      eval: matcher as never, // ✗ the runtime calls eval(bindings, runtimeValues)
    });
    const wrapped = defineNode({
      name: "bare",
      pattern: addPattern,
      precedence: 1,
      resultType: "l",
      eval: (b) => matcher(b as never), // ✓ wrap it
    });

    expect(() => {
      createParser([num, bare] as const).evaluate("1 & 2", {}, {});
    }).toThrow(); // "Cannot read properties of undefined (reading 'push')"
    expect(createParser([num, wrapped] as const).evaluate("1 & 2", {}, {})).toBe(3);
  });

  it("the documented soundness hole: a union-typed identifier can straddle branches", () => {
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
    const num = defineNode({ name: "n", pattern: [number()], precedence: 2 });
    const subR = defineNode({
      name: "subR",
      pattern: [operand("number").as("l"), constVal("-"), rest("number").as("r")],
      precedence: 1,
      resultType: "number",
      eval: ({ l, r }) => l - r,
    });
    const right = createParser([num, subR] as const);
    expect(right.evaluate("10-5-2", {}, {})).toBe(7); // 10-(5-2)
  });

  it("mixing tail shapes within one precedence level is a construction error", () => {
    const num = defineNode({ name: "n", pattern: [number()], precedence: 2 });
    const left = defineNode({
      name: "l",
      pattern: [operand("number").as("a"), constVal("+"), operand("number").as("b")],
      precedence: 1,
      resultType: "number",
    });
    const right = defineNode({
      name: "r",
      pattern: [operand("number").as("a"), constVal("-"), rest("number").as("b")],
      precedence: 1,
      resultType: "number",
    });
    expect(() => {
      createParser([num, left, right] as const);
    }).toThrow(/mixes tail shapes/);
  });

  it("an undelimited expr() is a construction error (it would swallow looser operators)", () => {
    // If this compiled, `10 - 5 == 2` would parse as `10 - (5 == 2)`:
    // expr() resets to the FULL grammar, so with nothing bounding it, the
    // eq at a looser precedence gets consumed inside sub's operand.
    const num = defineNode({ name: "n", pattern: [number()], precedence: 2 });
    const bad = defineNode({
      name: "bad",
      pattern: [operand("number").as("a"), constVal("-"), expr().as("b")],
      precedence: 1,
      resultType: "number",
    });
    expect(() => {
      createParser([num, bad] as const);
    }).toThrow(/expr\(\) element with no constVal after it/);
  });
});

describe("DESIGN: keyword literals — alternation order matters", () => {
  it("a path() node BEFORE boolean() swallows `true` as an identifier", () => {
    const variable = defineNode({ name: "var", pattern: [path()], precedence: 1 });
    const boolLit = defineNode({ name: "bool", pattern: [boolean()], precedence: 1 });

    const keywordsFirst = createParser([boolLit, variable] as const);
    const variableFirst = createParser([variable, boolLit] as const);

    const good = keywordsFirst.safeParse("true", {});
    expect(good.success && good.ast).toMatchObject({
      node: "literal",
      value: true,
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

describe("DESIGN: evaluation model — security & dev assertions", () => {
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

  it("dev-mode result assertions catch evals that lie about their resultType", () => {
    const num = defineNode({ name: "n", pattern: [number()], precedence: 2 });
    const liar = defineNode({
      name: "liar",
      pattern: [operand("number").as("a"), constVal("!"), rest("number").as("b")],
      precedence: 1,
      resultType: "number",
      eval: ({ a, b }) => String(a + b) as never, // returns a string
    });
    expect(() => {
      createParser([num, liar] as const, { dev: true }).evaluate("1 ! 2", {}, {});
    }).toThrow(EvaluationError);
    expect(
      createParser([num, liar] as const, { dev: false }).evaluate("1 ! 2", {}, {})
    ).toBe("3");
  });
});

describe("review findings (Fable, 2026-07-07) — regression pins", () => {
  it("F1: morph-typed schema leaves cannot crash or corrupt the caches", () => {
    const f = type("string").pipe((s) => s.length);
    const g = type("string").pipe((s) => s + "!");
    const num = defineNode({ name: "n", pattern: [number()], precedence: 2 });
    const vary = defineNode({ name: "v", pattern: [path()], precedence: 2 });
    const coalesce = defineNode({
      name: "coalesce",
      pattern: [operand().as("x"), constVal("??"), rest("x | null").as("y")],
      precedence: 1,
      resultType: "x",
      eval: ({ x }) => x as never,
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
    const num = defineNode({ name: "n", pattern: [number()], precedence: 2 });
    const sneaky = defineNode({
      name: "sneaky",
      pattern: [operand("number").as("a"), constVal("!"), rest("number").as("b")],
      precedence: 1,
      resultType: { "~resolved": "number" } as never,
    });
    expect(() => {
      createParser([num, sneaky] as const);
    }).toThrow(/'~resolved' key .* reserved/);
  });

  it("F3: refinement-on-reference templates get an honest construction error", () => {
    const num = defineNode({ name: "n", pattern: [number()], precedence: 2 });
    const refined = defineNode({
      name: "refined",
      pattern: [operand("number").as("left"), constVal("!"), rest("left > 5").as("r")],
      precedence: 1,
      resultType: "number",
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
