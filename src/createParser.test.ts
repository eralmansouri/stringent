/**
 * createParser API tests: parse() throwing behavior, safeParse result
 * shapes, and grammar validation at construction.
 */

import { describe, expect, it } from "vitest";
import {
  StringentParseError,
  constVal,
  createParser,
  defineNode,
  lhs,
  number,
  rhs,
} from "./index.js";
import { fixtureParser as parser } from "./__fixtures__/grammar.js";

const num = defineNode({
  name: "number",
  pattern: [number()],
  precedence: "atom",
  resultType: "number",
});

describe("parse", () => {
  it("returns the [ast, \"\"] tuple for valid literals", () => {
    const [ast, rest] = parser.parse("1+2", {});
    expect(rest).toBe("");
    expect(ast).toMatchObject({ node: "add", outputSchema: "number" });
  });

  it("throws StringentParseError when the compile-time check is bypassed", () => {
    expect(() => parser.parse("@invalid" as never, {})).toThrow(StringentParseError);
    try {
      parser.parse("1+2 junk" as never, {});
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(StringentParseError);
      expect((error as StringentParseError).position).toBe(4);
    }
  });
});

describe("safeParse", () => {
  it("accepts dynamic strings", () => {
    const dynamic: string = "1+2";
    const result = parser.safeParse(dynamic, {});
    expect(result.success).toBe(true);
  });

  it("requires full consumption", () => {
    const result = parser.safeParse("1+2 extra", {});
    expect(result.success).toBe(false);
  });

  it("returns structured errors", () => {
    const result = parser.safeParse("@invalid", {});
    expect(result).toMatchObject({
      success: false,
      error: {
        code: "PARSE_ERROR",
        position: 0,
        found: '"@invalid"',
      },
    });
  });
});

describe("grammar validation", () => {
  it("rejects duplicate node names", () => {
    expect(() => createParser([num, num] as const)).toThrow(/duplicate node name/);
  });

  it("rejects negative precedence", () => {
    const bad = defineNode({
      name: "bad",
      pattern: [lhs().as("l"), constVal("!"), rhs().as("r")],
      precedence: -1,
      resultType: "number",
    });
    expect(() => createParser([num, bad] as const)).toThrow(/non-negative integer/);
  });

  it("rejects fractional precedence", () => {
    const bad = defineNode({
      name: "bad",
      pattern: [lhs().as("l"), constVal("!"), rhs().as("r")],
      precedence: 1.5,
      resultType: "number",
    });
    expect(() => createParser([num, bad] as const)).toThrow(/non-negative integer/);
  });

  it("rejects mixed associativity within one precedence level", () => {
    const left = defineNode({
      name: "left",
      pattern: [lhs().as("l"), constVal("+"), rhs().as("r")],
      precedence: 1,
      associativity: "left",
      resultType: "number",
    });
    const right = defineNode({
      name: "right",
      pattern: [lhs().as("l"), constVal("-"), rhs().as("r")],
      precedence: 1,
      associativity: "right",
      resultType: "number",
    });
    expect(() => createParser([num, left, right] as const)).toThrow(
      /mix left and right associativity/
    );
  });

  it("rejects left-associative nodes whose pattern does not start with lhs", () => {
    const bad = defineNode({
      name: "bad",
      pattern: [constVal("-"), rhs().as("operand")],
      precedence: 1,
      associativity: "left",
      resultType: "number",
    });
    expect(() => createParser([num, bad] as const)).toThrow(
      /must have a pattern starting with lhs/
    );
  });
});
