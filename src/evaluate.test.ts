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
  lhs,
  number,
  path,
  rhs,
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

  it("short-circuits lazy nodes: untaken branches are never evaluated", () => {
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

  describe("dev-mode result assertions", () => {
    const badNodes = [
      defineNode({ name: "n", pattern: [number()], precedence: 2 }),
      defineNode({
        name: "cat",
        pattern: [lhs("number").as("a"), constVal("&"), rhs("number").as("b")],
        precedence: 1,
        resultType: "number",
        // deliberately returns the WRONG shape (a string)
        eval: ({ a, b }) => String(a + b) as never,
      }),
    ] as const;

    it("throws when an eval output does not satisfy the node's result type", () => {
      const p = createParser(badNodes, { dev: true });
      expect(() => {
        p.evaluate("1 & 2", {}, {});
      }).toThrow(/eval for node 'cat' returned a string, which does not satisfy the node's result type 'number'/);
    });

    it("skips the assertion when dev is off", () => {
      const p = createParser(badNodes, { dev: false });
      expect(p.evaluate("1 & 2", {}, {})).toBe("3");
    });

    it("checks binding-reference result types against the per-parse resolved type", () => {
      const nodes = [
        defineNode({ name: "n", pattern: [number()], precedence: 2 }),
        defineNode({
          name: "wrap",
          pattern: [constVal("["), expr().as("inner"), constVal("]")],
          precedence: 2,
          resultType: "inner",
          eval: ({ inner }) => String(inner) as never,
        }),
      ] as const;
      const p = createParser(nodes, { dev: true });
      expect(() => {
        p.evaluate("[1]", {}, {});
      }).toThrow(/does not satisfy the node's result type 'number'/);
    });

    it("skips ASTs without attached parse Types (e.g. deserialized)", () => {
      const p = createParser(badNodes, { dev: true });
      const parsed = p.safeParse("1 & 2", {});
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        const roundTripped = JSON.parse(JSON.stringify(parsed.ast));
        expect(p.evaluateAst(roundTripped, {})).toBe("3");
      }
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
