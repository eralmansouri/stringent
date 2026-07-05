/**
 * createParser API tests: parse() throwing behavior, safeParse result
 * shapes, vocabulary validation, and grammar validation at construction.
 */

import { describe, expect, it } from "vitest";
import {
  StringentParseError,
  constVal,
  createParser,
  defineNode,
  fromBinding,
  lhs,
  number,
  rhs,
  sameAs,
} from "./index.js";
import { fixtureParser as parser } from "./__fixtures__/grammar.js";

const num = defineNode({
  name: "n",
  pattern: [number()],
  precedence: "atom",
});

describe("parse", () => {
  it("returns the [ast, \"\"] tuple for valid literals", () => {
    const [ast, rest] = parser.parse("1+2", {});
    expect(rest).toBe("");
    expect(ast).toMatchObject({ node: "add", outputSchema: "number" });
  });

  it("accepts trailing whitespace (matching safeParse)", () => {
    const [ast] = parser.parse("1+2 ", {});
    expect(ast).toMatchObject({ node: "add" });
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

describe("type vocabulary", () => {
  it("exposes the grammar's type names", () => {
    expect(parser.typeNames.has("number")).toBe(true);
    expect(parser.typeNames.has("boolean")).toBe(true);
    expect(parser.typeNames.has("numbr")).toBe(false);
  });

  it("rejects schema leaves outside the vocabulary (runtime)", () => {
    expect(() => parser.safeParse("x", { x: "numbr" } as never)).toThrow(
      /schema key 'x' has unknown type 'numbr'/
    );
  });

  it("names the offending nested key", () => {
    expect(() =>
      parser.safeParse("x", { a: { b: "numbr" } } as never)
    ).toThrow(/schema key 'a\.b'/);
  });

  it("rejects constraint strings outside the vocabulary at construction", () => {
    const bad = defineNode({
      name: "bad",
      pattern: [lhs("numbr").as("l"), constVal("!"), rhs().as("r")],
      precedence: 1,
      resultType: "number",
    });
    expect(() => createParser([num, bad] as const)).toThrow(
      /constraint 'numbr' which matches no known type/
    );
  });

  it("extends the vocabulary via the types option", () => {
    const dateVar = defineNode({
      name: "later",
      pattern: [lhs("date").as("l"), constVal(">"), rhs("date").as("r")],
      precedence: 1,
      resultType: "boolean",
    });
    const p = createParser([num, dateVar] as const, { types: ["date"] });
    expect(p.typeNames.has("date")).toBe(true);
    expect(() => p.safeParse("1", { created: "date" })).not.toThrow();
  });
});

describe("grammar validation", () => {
  it("rejects duplicate node names", () => {
    expect(() => createParser([num, num] as const)).toThrow(/duplicate node name/);
  });

  it("rejects reserved node names", () => {
    const reserved = defineNode({
      name: "literal",
      pattern: [number()],
      precedence: "atom",
    });
    expect(() => createParser([reserved] as const)).toThrow(/reserved/);
  });

  it("rejects negative and fractional precedence", () => {
    const make = (precedence: number) =>
      defineNode({
        name: "bad",
        pattern: [lhs().as("l"), constVal("!"), rhs().as("r")],
        precedence,
        resultType: "number",
      });
    expect(() => createParser([num, make(-1)] as const)).toThrow(
      /non-negative safe integer/
    );
    expect(() => createParser([num, make(1.5)] as const)).toThrow(
      /non-negative safe integer/
    );
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

  it("rejects rhs/expr at position 0 (left recursion → stack overflow)", () => {
    const postfix = defineNode({
      name: "postfix",
      pattern: [rhs("number").as("v"), constVal("!")],
      precedence: 1,
      resultType: "number",
    });
    expect(() => createParser([num, postfix] as const)).toThrow(
      /would recurse into the same level forever/
    );
  });

  it("rejects atoms starting with expression elements", () => {
    const bad = defineNode({
      name: "bad",
      pattern: [lhs().as("v")],
      precedence: "atom",
      resultType: "number",
    });
    expect(() => createParser([num, bad] as const)).toThrow(
      /atoms must start with a consuming element/
    );
  });

  it("rejects empty constVal", () => {
    const bad = defineNode({
      name: "bad",
      pattern: [lhs().as("l"), constVal(""), rhs().as("r")],
      precedence: 1,
      resultType: "number",
    });
    expect(() => createParser([num, bad] as const)).toThrow(/constVal\(""\)/);
  });

  it("rejects sameAs references to unknown or later bindings", () => {
    const bad = defineNode({
      name: "bad",
      pattern: [lhs(sameAs("nope") as never).as("l"), constVal("!"), rhs().as("r")],
      precedence: 1,
      resultType: "number",
    });
    expect(() => createParser([num, bad] as const)).toThrow(/sameAs/);

    const forward = defineNode({
      name: "fwd",
      pattern: [lhs().as("l"), constVal("!"), rhs(sameAs("later")).as("later")],
      precedence: 1,
      resultType: "number",
    });
    expect(() => createParser([num, forward] as const)).toThrow(
      /no earlier element is named 'later'/
    );
  });

  it("rejects fromBinding references to unknown bindings", () => {
    const bad = defineNode({
      name: "bad",
      pattern: [lhs().as("l"), constVal("!"), rhs().as("r")],
      precedence: 1,
      resultType: fromBinding("nope"),
    });
    expect(() => createParser([num, bad] as const)).toThrow(
      /fromBinding\('nope'\)/
    );
  });

  it("requires resultType for non-passthrough patterns", () => {
    const bad = defineNode({
      name: "bad",
      pattern: [number().as("n")],
      precedence: "atom",
    });
    expect(() => createParser([bad] as const)).toThrow(/needs a resultType/);
  });

  it("allows const-only atoms with a declared resultType", () => {
    const boolTrue = defineNode({
      name: "true",
      pattern: [constVal("true")],
      precedence: "atom",
      resultType: "boolean",
      eval: () => true,
    });
    const p = createParser([num, boolTrue] as const);
    const result = p.safeParse("true", {});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.ast).toEqual({ node: "true", outputSchema: "boolean" });
      expect(p.evaluateAst(result.ast, {})).toBe(true);
    }
  });
});
