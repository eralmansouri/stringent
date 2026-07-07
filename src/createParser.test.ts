/**
 * createParser API tests: parse() throwing behavior, safeParse result
 * shapes, scope/schema validation, and grammar validation at construction.
 */

import { describe, expect, it } from "vitest";
import {
  StringentParseError,
  constVal,
  createParser,
  defineNode,
  operand,
  number,
  path as pathEl,
  rest,
  expr,
} from "./index.js";
import { fixtureParser as parser } from "./__fixtures__/grammar.js";

const num = defineNode({
  name: "n",
  pattern: [number()],
  precedence: 9,
});

describe("parse", () => {
  it('returns the [ast, ""] tuple for valid literals', () => {
    const [ast, rest] = parser.parse("1+2", {});
    expect(rest).toBe("");
    expect(ast).toMatchObject({ node: "add", outputSchema: "number" });
  });

  it("accepts trailing whitespace and returns it as rest (matching Parse<>)", () => {
    const [ast, rest] = parser.parse("1+2 ", {});
    expect(ast).toMatchObject({ node: "add" });
    expect(rest).toBe(" ");
  });

  it("throws StringentParseError for invalid input", () => {
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

describe("schemas and scope", () => {
  it("rejects schema leaves that are not resolvable defs (runtime)", () => {
    expect(() => parser.safeParse("x", { x: "numbr" } as never)).toThrow(
      /invalid schema/
    );
  });

  it("rejects invalid nested schema leaves", () => {
    expect(() =>
      parser.safeParse("x", { a: { b: "numbr" } } as never)
    ).toThrow(/invalid schema/);
  });

  it("accepts arktype expressions and keywords as schema leaves", () => {
    const result = parser.safeParse("x == y", {
      x: "string.email",
      y: "string.email",
    });
    expect(result.success).toBe(true);
  });

  it("rejects constraint defs outside the scope at construction", () => {
    const bad = defineNode({
      name: "bad",
      pattern: [operand("numbr").as("l"), constVal("!"), rest().as("r")],
      precedence: 1,
      resultType: "number",
    });
    // block body: keeps vitest's expect from instantiating matchers over
    // the Parser type (TS2589 with an unresolvable constraint def)
    expect(() => {
      createParser([num, bad] as const);
    }).toThrow(/neither a type in scope nor an earlier binding/);
  });

  it("extends the scope via the scope option", () => {
    const dateVar = defineNode({
      name: "later",
      pattern: [operand("Timestamp").as("l"), constVal(">"), rest("Timestamp").as("r")],
      precedence: 1,
      resultType: "boolean",
    });
    const variable = defineNode({
      name: "v",
      pattern: [pathEl()],
      precedence: 9,
    });
    const p = createParser([num, variable, dateVar] as const, {
      scope: { Timestamp: "number" },
    });
    // Known limitation (deferred): compile-time schema validation is
    // scope-blind (runs in arktype's default scope), so custom aliases
    // need a cast at compile time; runtime checks them fully.
    expect(() => p.safeParse("1", { created: "Timestamp" } as never)).not.toThrow();
    const result = p.safeParse("created > 1", { created: "Timestamp" } as never);
    expect(result.success).toBe(true);
  });

  it("matches constraints by assignability, not name equality", () => {
    const variable = defineNode({
      name: "v",
      pattern: [pathEl()],
      precedence: 9,
    });
    const positive = defineNode({
      name: "isPos",
      pattern: [operand("number").as("v"), constVal("!")],
      precedence: 1,
      resultType: "boolean",
      eval: ({ v }) => v > 0,
    });
    const p = createParser([num, variable, positive] as const);
    // schema leaf is a REFINED number; the slot wants plain number —
    // assignability accepts (number > 0 ⊆ number)
    const result = p.safeParse("x !", { x: "number > 0" });
    expect(result.success).toBe(true);
  });
});

describe("grammar validation", () => {
  it("rejects duplicate node names", () => {
    expect(() => {
      createParser([num, num] as const);
    }).toThrow(/duplicate node name/);
  });

  it("rejects reserved node names", () => {
    const reserved = defineNode({
      name: "literal",
      pattern: [number()],
      precedence: 9,
    });
    expect(() => {
      createParser([reserved] as const);
    }).toThrow(/reserved/);
  });

  it("rejects negative, fractional, and non-numeric precedence", () => {
    const make = (precedence: number) =>
      defineNode({
        name: "bad",
        pattern: [operand().as("l"), constVal("!"), rest().as("r")],
        precedence,
        resultType: "number",
      });
    expect(() => {
      createParser([num, make(-1)] as const);
    }).toThrow(
      /non-negative safe integer/
    );
    expect(() => {
      createParser([num, make(1.5)] as const);
    }).toThrow(
      /non-negative safe integer/
    );
    expect(() => {
      createParser([num, make("atom" as never)] as const);
    }).toThrow(/non-negative safe integer/);
  });

  it("rejects mixed tail shapes within one precedence level", () => {
    const leftTail = defineNode({
      name: "leftTail",
      pattern: [operand().as("l"), constVal("+"), operand().as("r")],
      precedence: 1,
      resultType: "number",
    });
    const rightTail = defineNode({
      name: "rightTail",
      pattern: [operand().as("l"), constVal("-"), rest().as("r")],
      precedence: 1,
      resultType: "number",
    });
    expect(() => {
      createParser([num, leftTail, rightTail] as const);
    }).toThrow(
      /mixes tail shapes/
    );
  });

  it("rejects nodes on a left-associative level that do not start with operand", () => {
    const fold = defineNode({
      name: "fold",
      pattern: [operand().as("l"), constVal("+"), operand().as("r")],
      precedence: 1,
      resultType: "number",
    });
    const prefix = defineNode({
      name: "prefix",
      pattern: [constVal("-"), operand().as("operand")],
      precedence: 1,
      resultType: "number",
    });
    expect(() => {
      createParser([num, fold, prefix] as const);
    }).toThrow(
      /must start with operand/
    );
  });

  it("rejects rest/expr at position 0 (left recursion → stack overflow)", () => {
    const postfix = defineNode({
      name: "postfix",
      pattern: [rest("number").as("v"), constVal("!"), rest().as("r")],
      precedence: 1,
      resultType: "number",
    });
    expect(() => {
      createParser([num, postfix] as const);
    }).toThrow(
      /would recurse into the same level forever/
    );
  });

  it("rejects leaf nodes starting with expression elements", () => {
    const bad = defineNode({
      name: "bad",
      pattern: [operand().as("v"), constVal("!")],
      precedence: 9,
      resultType: "number",
    });
    // both nodes sit on the (single) leaf level
    expect(() => {
      createParser([num, bad] as const);
    }).toThrow(
      /must start with a consuming element/
    );
  });

  it("rejects expr() elements with no closing constVal", () => {
    const bad = defineNode({
      name: "bad",
      pattern: [operand("number").as("l"), constVal("-"), expr().as("r")],
      precedence: 1,
      resultType: "number",
    });
    expect(() => {
      createParser([num, bad] as const);
    }).toThrow(
      /expr\(\) element with no constVal after it/
    );
  });

  it("rejects empty constVal", () => {
    const bad = defineNode({
      name: "bad",
      pattern: [operand().as("l"), constVal(""), rest().as("r")],
      precedence: 1,
      resultType: "number",
    });
    expect(() => {
      createParser([num, bad] as const);
    }).toThrow(/constVal\(""\)/);
  });

  it("rejects constraints that are neither defs nor earlier bindings", () => {
    const forward = defineNode({
      name: "fwd",
      pattern: [operand().as("l"), constVal("!"), rest("later").as("later")],
      precedence: 1,
      resultType: "number",
    });
    expect(() => {
      createParser([num, forward] as const);
    }).toThrow(
      /neither an earlier binding name, a def referencing one, nor a valid type/
    );
  });

  it("rejects binding names that collide with AST structure", () => {
    for (const name of ["node", "outputSchema", "__proto__"] as const) {
      const bad = defineNode({
        name: "bad",
        pattern: [operand().as(name), constVal("!"), rest().as("r")],
        precedence: 1,
        resultType: "number",
      });
      expect(() => {
      createParser([num, bad] as const);
    }).toThrow(
        /would collide with the AST node structure/
      );
    }
  });

  it("rejects binding names that shadow types in scope", () => {
    const bad = defineNode({
      name: "bad",
      pattern: [operand().as("number"), constVal("!"), rest().as("r")],
      precedence: 1,
      resultType: "number",
    });
    expect(() => {
      createParser([num, bad] as const);
    }).toThrow(
      /must not shadow types/
    );
  });

  it("rejects duplicate binding names within one pattern", () => {
    const bad = defineNode({
      name: "bad",
      pattern: [operand().as("v"), constVal("#"), rest().as("v")],
      precedence: 1,
      resultType: "number",
    });
    expect(() => {
      createParser([num, bad] as const);
    }).toThrow(
      /binds the name 'v' twice/
    );
  });

  it("rejects constraints and resultTypes targeting const elements", () => {
    const constraintOnConst = defineNode({
      name: "bad1",
      pattern: [operand().as("l"), constVal("!").as("b"), rest("b").as("r")],
      precedence: 1,
      resultType: "number",
    });
    expect(() => {
      createParser([num, constraintOnConst] as const);
    }).toThrow(
      /binding 'b', which is a const element/
    );

    const resultFromConst = defineNode({
      name: "bad2",
      pattern: [operand().as("l"), constVal("!").as("b")],
      precedence: 1,
      resultType: "b",
    });
    expect(() => {
      createParser([num, resultFromConst] as const);
    }).toThrow(
      /binding 'b', which is a const element/
    );
  });

  it("rejects unsatisfiable constraint intersections at construction", () => {
    const impossible = defineNode({
      name: "impossible",
      pattern: [operand("number & string").as("l"), constVal("!")],
      precedence: 1,
      resultType: "boolean",
    });
    expect(() => {
      createParser([num, impossible] as const);
    }).toThrow(
      /neither an earlier binding name nor a valid type|unsatisfiable/
    );
  });

  it("requires resultType for non-passthrough patterns", () => {
    const bad = defineNode({
      name: "bad",
      pattern: [number().as("n")],
      precedence: 9,
    });
    expect(() => {
      createParser([bad] as const);
    }).toThrow(/needs a resultType/);
  });

  it("rejects resultType on single-element passthrough patterns", () => {
    const bad = defineNode({
      name: "bad",
      pattern: [number()],
      precedence: 9,
      resultType: "number",
    });
    expect(() => {
      createParser([bad] as const);
    }).toThrow(/passthrough/);
  });

  it("supports object resultTypes", () => {
    const pair = defineNode({
      name: "pair",
      pattern: [operand("number").as("min"), constVal(".."), rest("number").as("max")],
      precedence: 1,
      resultType: { min: "number", max: "number" },
      eval: ({ min, max }) => ({ min, max }),
    });
    const p = createParser([num, pair] as const);
    const result = p.safeParse("1 .. 2", {});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.ast.outputSchema).toBe("{ max: number, min: number }");
      expect(p.evaluateAst(result.ast, {})).toEqual({ min: 1, max: 2 });
    }
  });

  it("allows const-only leaf nodes with a declared resultType", () => {
    const boolTrue = defineNode({
      name: "true",
      pattern: [constVal("true")],
      precedence: 9,
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

describe("values validation on evaluate", () => {
  it("rejects values that do not match the schema", () => {
    expect(() =>
      parser.evaluate("x == x", { x: "number" }, { x: "not a number" } as never)
    ).toThrow(/values do not match the schema/);
  });

  it("enforces refinements on values even though typing is erased", () => {
    expect(() =>
      parser.evaluate("x + 1", { x: "number > 0" }, { x: -5 } as never)
    ).toThrow(/values do not match the schema/);
    // typing is erased (x parses as plain number), values stay refined
    expect(parser.evaluate("x + 1", { x: "number > 0" }, { x: 5 })).toBe(6);
  });
});
