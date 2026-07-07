/**
 * Evaluator tests: literal/identifier/path lookup, eval() dispatch,
 * associativity correctness, polymorphic eval, lazy short-circuiting,
 * security, and error cases.
 */

import { describe, expect, it } from "vitest";
import {
  EvaluationError,
  constVal,
  createParser,
  defineNode,
  expr,
  ident,
  operand,
  number,
  path,
  rest,
} from "./index.js";
import { fixtureParser as parser, formSchema } from "./__fixtures__/grammar.js";

describe("evaluate", () => {
  it("evaluates literals", () => {
    expect(parser.evaluate("42", {}, {})).toBe(42);
  });

  it("evaluates arithmetic with correct left associativity", () => {
    // The reason associativity matters: right-assoc would give 5-(2-1) = 4
    expect(parser.evaluate("5-2-1", {}, {})).toBe(2);
    expect(parser.evaluate("100/10/2", {}, {})).toBe(5);
  });

  it("evaluates right-associative operators correctly", () => {
    expect(parser.evaluate("2^3^2", {}, {})).toBe(512); // 2^(3^2)
  });

  it("respects precedence and parens", () => {
    expect(parser.evaluate("1+2*3", {}, {})).toBe(7);
    expect(parser.evaluate("(1+2)*3", {}, {})).toBe(9);
  });

  it("evaluates the overloaded add for both types", () => {
    expect(parser.evaluate("1+2", {}, {})).toBe(3);
    expect(parser.evaluate("'a'+'b'+'c'", {}, {})).toBe("abc");
  });

  it("rejects mixed pairs that slip through union-typed identifiers", () => {
    // The one hole in correlated bindings: x parses AS "string | number",
    // so `x + 1` satisfies both slots, but at runtime x may hold a string
    // while the right operand is a number. The fixture's match-based eval
    // uses .default("assert"), turning the mixed pair into a runtime error
    // instead of silent "hi1"-style coercion.
    expect(parser.evaluate("x + 1", { x: "string | number" }, { x: 1 })).toBe(2);
    expect(() => {
      parser.evaluate("x + 1", { x: "string | number" }, { x: "hi" });
    }).toThrow();
  });

  it("looks up identifiers in values", () => {
    expect(parser.evaluate("x+1", { x: "number" }, { x: 41 })).toBe(42);
  });

  it("evaluates keyword literals", () => {
    expect(parser.evaluate("true ? 'y' : 'n'", {}, {})).toBe("y");
    expect(parser.evaluate("false ? 'y' : 'n'", {}, {})).toBe("n");
    expect(parser.evaluate("x == null", { x: "string | null" }, { x: null })).toBe(
      true
    );
    expect(parser.evaluate("x == null", { x: "string | null" }, { x: "hi" })).toBe(
      false
    );
  });

  it("evaluates escaped strings to their unescaped values", () => {
    // dynamic path (safeParse) — the compile-time engine rejects \x/\u
    const result = parser.safeParse('"line1\\nline2" == x', { x: "string" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(parser.evaluateAst(result.ast, { x: "line1\nline2" })).toBe(true);
    }
    const hex = parser.safeParse('"\\x41\\u0042"', {});
    expect(hex.success).toBe(true);
    if (hex.success) {
      expect(parser.evaluateAst(hex.ast, {})).toBe("AB");
    }
  });

  it("evaluates the headline use case", () => {
    const matching = parser.evaluate(
      "values.password == values.confirmPassword",
      formSchema,
      { x: 0, values: { password: "hunter2", confirmPassword: "hunter2" } }
    );
    expect(matching).toBe(true);

    const differing = parser.evaluate(
      "values.password == values.confirmPassword",
      formSchema,
      { x: 0, values: { password: "hunter2", confirmPassword: "oops" } }
    );
    expect(differing).toBe(false);
  });

  it("evaluates ternaries", () => {
    expect(parser.evaluate("1==2 ? 3 : 4", {}, {})).toBe(4);
    expect(parser.evaluate("1==1 ? 'yes' : 'no'", {}, {})).toBe("yes");
    expect(parser.evaluate("1==2 ? 1 : 2==2 ? 4 : 5", {}, {})).toBe(4);
  });

  it("short-circuits: untaken branches are never evaluated", () => {
    // x is not in values — evaluating the else branch would throw
    const result = parser.safeParse("1==1 ? 2 : x", { x: "number" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(parser.evaluateAst(result.ast, {})).toBe(2);
    }
  });

  it("evaluates ASTs from safeParse (dynamic input)", () => {
    const dynamic: string = ["4", "*", "2"].join("");
    const result = parser.safeParse(dynamic, {});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(parser.evaluateAst(result.ast, {})).toBe(8);
    }
  });

  it("throws EvaluationError for undefined identifiers", () => {
    expect(() =>
      parser.evaluateAst(
        { node: "identifier", name: "missing", outputSchema: "unknown" },
        {}
      )
    ).toThrow(EvaluationError);
  });

  it("throws EvaluationError for undefined path segments", () => {
    const result = parser.safeParse("values.password", formSchema);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(() => parser.evaluateAst(result.ast, { values: {} })).toThrow(
        "'values.password' is not defined"
      );
    }
  });

  it("does not leak prototype members through identifier lookup", () => {
    expect(() =>
      parser.evaluateAst(
        { node: "identifier", name: "constructor", outputSchema: "unknown" },
        {}
      )
    ).toThrow("'constructor' is not defined");
    expect(() =>
      parser.evaluateAst(
        { node: "identifier", name: "__proto__", outputSchema: "unknown" },
        {}
      )
    ).toThrow("'__proto__' is not defined");
  });

  it("does not leak prototype members through path lookup", () => {
    expect(() =>
      parser.evaluateAst(
        { node: "path", path: ["x", "constructor"], outputSchema: "unknown" },
        { x: {} }
      )
    ).toThrow("'x.constructor' is not defined");
  });

  it("throws EvaluationError for nodes without eval", () => {
    const noEval = defineNode({
      name: "wrap",
      pattern: [path().as("inner")],
      precedence: 1,
      resultType: "unknown",
    });
    const p = createParser([noEval] as const);
    const parsed = p.safeParse("foo", { foo: "number" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(() => p.evaluateAst(parsed.ast as never, { foo: 1 })).toThrow(
        /has no eval function/
      );
    }
  });

  describe("uniform laziness", () => {
    it("memoizes binding thunks: a side-effecting child evaluates once", () => {
      let evaluations = 0;
      const nodes = [
        defineNode({ name: "n", pattern: [number()], precedence: 2 }),
        defineNode({
          name: "tick",
          pattern: [constVal("tick("), expr("number").as("inner"), constVal(")")],
          precedence: 2,
          resultType: "number",
          eval: ({ inner }) => {
            evaluations += 1;
            return inner();
          },
        }),
        defineNode({
          name: "twice",
          pattern: [operand("number").as("a"), constVal("&"), rest("number").as("b")],
          precedence: 1,
          resultType: "number",
          // calls each thunk twice — memoization means children still
          // evaluate exactly once
          eval: ({ a, b }) => a() + a() + b() + b(),
        }),
      ] as const;
      const p = createParser(nodes);
      expect(p.evaluate("tick(3) & tick(4)", {}, {})).toBe(14);
      expect(evaluations).toBe(2);
    });
  });

  it("evaluates single-segment ident() elements", () => {
    const numberLit = defineNode({
      name: "n",
      pattern: [number()],
      precedence: 1,
    });
    const variable = defineNode({
      name: "v",
      pattern: [ident()],
      precedence: 1,
    });
    const p = createParser([numberLit, variable] as const);
    const parsed = p.safeParse("y", { y: "number" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(p.evaluateAst(parsed.ast as never, { y: 7 })).toBe(7);
    }
  });
});
