/**
 * Prefix-operator and const-only-atom coverage.
 *
 * Uses the prefix mini-grammar from the fixtures: `true`/`false` const
 * atoms, prefix `!`, and a lazy `&&`. Pins the behaviors formeddable's
 * expression grammar relies on.
 */

import { describe, expect, it } from "vitest";

import { prefixParser } from "./__fixtures__/grammar.js";

const boolSchema = { x: "boolean", flags: { on: "boolean" } } as const;

describe("const-only atoms", () => {
  it("parses boolean literals into named nodes with a static resultType", () => {
    const result = prefixParser.safeParse("true", {});
    expect(result).toEqual({
      success: true,
      ast: { node: "true", outputSchema: "boolean" },
    });
  });

  it("evaluates boolean literals", () => {
    expect(prefixParser.evaluate("true", {}, {})).toBe(true);
    expect(prefixParser.evaluate("false", {}, {})).toBe(false);
  });
});

describe("prefix operators", () => {
  it("parses a leading-const pattern", () => {
    const result = prefixParser.safeParse("!true", {});
    expect(result).toEqual({
      success: true,
      ast: {
        node: "not",
        outputSchema: "boolean",
        value: { node: "true", outputSchema: "boolean" },
      },
    });
  });

  it("supports right-recursion (!!x)", () => {
    expect(prefixParser.evaluate("!!x", { x: "boolean" }, { x: true })).toBe(true);
    expect(prefixParser.evaluate("!!!x", { x: "boolean" }, { x: true })).toBe(false);
  });

  it("negates schema variables and paths", () => {
    expect(prefixParser.evaluate("!x", { x: "boolean" }, { x: true })).toBe(false);
    expect(
      prefixParser.evaluate("!flags.on", boolSchema, {
        x: false,
        flags: { on: false },
      })
    ).toBe(true);
  });

  it("binds tighter than && (prefix level above infix level)", () => {
    // !x && y must parse as (!x) && y, not !(x && y)
    expect(
      prefixParser.evaluate("!x && x", { x: "boolean" }, { x: true })
    ).toBe(false);
    expect(
      prefixParser.evaluate("!x && !x", { x: "boolean" }, { x: false })
    ).toBe(true);
  });

  it("rejects a non-boolean operand with a typed error", () => {
    const result = prefixParser.safeParse("!x", { x: "number" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("TYPE_MISMATCH");
    }
  });

  it("rejects a dangling prefix operator", () => {
    const result = prefixParser.safeParse("!", {});
    expect(result.success).toBe(false);
  });
});
