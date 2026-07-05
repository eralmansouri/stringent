/**
 * Evaluator tests: literal/identifier/path lookup, eval() dispatch,
 * left-vs-right associativity correctness, and error cases.
 */

import { describe, expect, it } from "vitest";
import { EvaluationError, createParser, defineNode, ident, number, path } from "./index.js";
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

  it("evaluates ASTs from safeParse (dynamic input)", () => {
    const dynamic: string = ["4", "*", "2"].join("");
    const result = parser.safeParse(dynamic, {});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(parser.evaluateAst(result.ast, {})).toBe(8);
    }
  });

  it("throws EvaluationError for undefined identifiers", () => {
    expect(() => parser.evaluateAst({ node: "identifier", name: "missing", outputSchema: "unknown" }, {}))
      .toThrow(EvaluationError);
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

  it("throws EvaluationError for nodes without eval", () => {
    const noEval = defineNode({
      name: "wrap",
      pattern: [path().as("inner")],
      precedence: "atom",
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

  it("evaluates single-segment ident() elements", () => {
    const numberLit = defineNode({
      name: "number",
      pattern: [number()],
      precedence: "atom",
      resultType: "number",
    });
    const variable = defineNode({
      name: "var",
      pattern: [ident()],
      precedence: "atom",
      resultType: "unknown",
    });
    const p = createParser([numberLit, variable] as const);
    const parsed = p.safeParse("y", { y: "number" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(p.evaluateAst(parsed.ast as never, { y: 7 })).toBe(7);
    }
  });
});
