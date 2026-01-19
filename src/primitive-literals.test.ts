/**
 * Tests for primitive literals: null, boolean, undefined
 * Task 2.1 - Add Missing Primitive Literals
 */

import { describe, it, expect } from "vitest";
import { createParser, defineNode, lhs, rhs, constVal, emptyContext } from "./index.js";
import type {
  NullNode,
  BooleanNode,
  UndefinedNode,
  ComputeGrammar,
  Parse,
  Context,
} from "./index.js";
import { parse, BUILT_IN_ATOMS } from "./runtime/parser.js";
import type { AssertEqual } from "./test-helpers.js";

// =============================================================================
// Runtime Parser Tests
// =============================================================================

describe("primitive literals - runtime parsing", () => {
  describe("null literal", () => {
    it("should parse 'null' keyword", () => {
      const result = parse([], "null", emptyContext);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        node: "literal",
        raw: "null",
        value: null,
        outputSchema: "null",
      });
      expect(result[1]).toBe("");
    });

    it("should parse 'null' with remaining input", () => {
      const result = parse([], "null + 1", emptyContext);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        node: "literal",
        raw: "null",
        value: null,
        outputSchema: "null",
      });
      expect(result[1]).toBe(" + 1");
    });

    it("should not parse 'nullable' as null", () => {
      const result = parse([], "nullable", emptyContext);
      expect(result).toHaveLength(2);
      // Should be parsed as an identifier, not null
      expect(result[0]).toHaveProperty("node", "identifier");
      expect(result[0]).toHaveProperty("name", "nullable");
    });

    it("should not parse 'nullish' as null", () => {
      const result = parse([], "nullish", emptyContext);
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty("node", "identifier");
      expect(result[0]).toHaveProperty("name", "nullish");
    });

    it("should parse 'null' followed by operator", () => {
      const result = parse([], "null==null", emptyContext);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        node: "literal",
        raw: "null",
        value: null,
        outputSchema: "null",
      });
      expect(result[1]).toBe("==null");
    });
  });

  describe("boolean literal - true", () => {
    it("should parse 'true' keyword", () => {
      const result = parse([], "true", emptyContext);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        node: "literal",
        raw: "true",
        value: true,
        outputSchema: "boolean",
      });
      expect(result[1]).toBe("");
    });

    it("should parse 'true' with remaining input", () => {
      const result = parse([], "true || false", emptyContext);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        node: "literal",
        raw: "true",
        value: true,
        outputSchema: "boolean",
      });
      expect(result[1]).toBe(" || false");
    });

    it("should not parse 'trueName' as true", () => {
      const result = parse([], "trueName", emptyContext);
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty("node", "identifier");
      expect(result[0]).toHaveProperty("name", "trueName");
    });

    it("should not parse 'trueish' as true", () => {
      const result = parse([], "trueish", emptyContext);
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty("node", "identifier");
      expect(result[0]).toHaveProperty("name", "trueish");
    });
  });

  describe("boolean literal - false", () => {
    it("should parse 'false' keyword", () => {
      const result = parse([], "false", emptyContext);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        node: "literal",
        raw: "false",
        value: false,
        outputSchema: "boolean",
      });
      expect(result[1]).toBe("");
    });

    it("should parse 'false' with remaining input", () => {
      const result = parse([], "false && true", emptyContext);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        node: "literal",
        raw: "false",
        value: false,
        outputSchema: "boolean",
      });
      expect(result[1]).toBe(" && true");
    });

    it("should not parse 'falsehood' as false", () => {
      const result = parse([], "falsehood", emptyContext);
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty("node", "identifier");
      expect(result[0]).toHaveProperty("name", "falsehood");
    });

    it("should not parse 'falsey' as false", () => {
      const result = parse([], "falsey", emptyContext);
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty("node", "identifier");
      expect(result[0]).toHaveProperty("name", "falsey");
    });
  });

  describe("undefined literal", () => {
    it("should parse 'undefined' keyword", () => {
      const result = parse([], "undefined", emptyContext);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        node: "literal",
        raw: "undefined",
        value: undefined,
        outputSchema: "undefined",
      });
      expect(result[1]).toBe("");
    });

    it("should parse 'undefined' with remaining input", () => {
      const result = parse([], "undefined != null", emptyContext);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        node: "literal",
        raw: "undefined",
        value: undefined,
        outputSchema: "undefined",
      });
      expect(result[1]).toBe(" != null");
    });

    it("should not parse 'undefinedVar' as undefined", () => {
      const result = parse([], "undefinedVar", emptyContext);
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty("node", "identifier");
      expect(result[0]).toHaveProperty("name", "undefinedVar");
    });

    it("should not parse 'undefined_value' as undefined", () => {
      const result = parse([], "undefined_value", emptyContext);
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty("node", "identifier");
      expect(result[0]).toHaveProperty("name", "undefined_value");
    });
  });

  describe("primitive literals with operators", () => {
    const nullCheck = defineNode({
      name: "nullCheck",
      pattern: [lhs().as("left"), constVal("=="), rhs().as("right")],
      precedence: 1,
      resultType: "boolean",
    });

    it("should parse null == null", () => {
      const result = parse([nullCheck], "null == null", emptyContext);
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty("node", "nullCheck");
      expect((result[0] as any).left).toEqual({
        node: "literal",
        raw: "null",
        value: null,
        outputSchema: "null",
      });
      expect((result[0] as any).right).toEqual({
        node: "literal",
        raw: "null",
        value: null,
        outputSchema: "null",
      });
    });

    it("should parse true == false", () => {
      const result = parse([nullCheck], "true == false", emptyContext);
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty("node", "nullCheck");
      expect((result[0] as any).left).toEqual({
        node: "literal",
        raw: "true",
        value: true,
        outputSchema: "boolean",
      });
      expect((result[0] as any).right).toEqual({
        node: "literal",
        raw: "false",
        value: false,
        outputSchema: "boolean",
      });
    });

    it("should parse undefined == null", () => {
      const result = parse([nullCheck], "undefined == null", emptyContext);
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty("node", "nullCheck");
      expect((result[0] as any).left).toEqual({
        node: "literal",
        raw: "undefined",
        value: undefined,
        outputSchema: "undefined",
      });
      expect((result[0] as any).right).toEqual({
        node: "literal",
        raw: "null",
        value: null,
        outputSchema: "null",
      });
    });
  });

  describe("BUILT_IN_ATOMS includes new literals", () => {
    it("should include nullAtom", () => {
      const atomNames = BUILT_IN_ATOMS.map((a) => a.name);
      expect(atomNames).toContain("nullLiteral");
    });

    it("should include booleanAtom", () => {
      const atomNames = BUILT_IN_ATOMS.map((a) => a.name);
      expect(atomNames).toContain("booleanLiteral");
    });

    it("should include undefinedAtom", () => {
      const atomNames = BUILT_IN_ATOMS.map((a) => a.name);
      expect(atomNames).toContain("undefinedLiteral");
    });
  });
});

// =============================================================================
// Type-Level Parsing Tests
// =============================================================================

describe("primitive literals - type-level parsing", () => {
  type TestContext = { data: Record<string, never> };
  type TestGrammar = ComputeGrammar<[]>;

  describe("null literal type parsing", () => {
    it("should infer NullNode for 'null' input", () => {
      type Result = Parse<TestGrammar, "null", TestContext>;
      type Expected = [NullNode, ""];
      const _check: AssertEqual<Result, Expected> = true;
      expect(_check).toBe(true);
    });

    it("should preserve remaining input", () => {
      type Result = Parse<TestGrammar, "null + 1", TestContext>;
      type Expected = [NullNode, " + 1"];
      const _check: AssertEqual<Result, Expected> = true;
      expect(_check).toBe(true);
    });
  });

  describe("boolean literal type parsing - true", () => {
    it("should infer BooleanNode<\"true\"> for 'true' input", () => {
      type Result = Parse<TestGrammar, "true", TestContext>;
      type Expected = [BooleanNode<"true">, ""];
      const _check: AssertEqual<Result, Expected> = true;
      expect(_check).toBe(true);
    });

    it("should preserve remaining input", () => {
      type Result = Parse<TestGrammar, "true || false", TestContext>;
      type Expected = [BooleanNode<"true">, " || false"];
      const _check: AssertEqual<Result, Expected> = true;
      expect(_check).toBe(true);
    });
  });

  describe("boolean literal type parsing - false", () => {
    it("should infer BooleanNode<\"false\"> for 'false' input", () => {
      type Result = Parse<TestGrammar, "false", TestContext>;
      type Expected = [BooleanNode<"false">, ""];
      const _check: AssertEqual<Result, Expected> = true;
      expect(_check).toBe(true);
    });

    it("should preserve remaining input", () => {
      type Result = Parse<TestGrammar, "false && true", TestContext>;
      type Expected = [BooleanNode<"false">, " && true"];
      const _check: AssertEqual<Result, Expected> = true;
      expect(_check).toBe(true);
    });
  });

  describe("undefined literal type parsing", () => {
    it("should infer UndefinedNode for 'undefined' input", () => {
      type Result = Parse<TestGrammar, "undefined", TestContext>;
      type Expected = [UndefinedNode, ""];
      const _check: AssertEqual<Result, Expected> = true;
      expect(_check).toBe(true);
    });

    it("should preserve remaining input", () => {
      type Result = Parse<TestGrammar, "undefined != null", TestContext>;
      type Expected = [UndefinedNode, " != null"];
      const _check: AssertEqual<Result, Expected> = true;
      expect(_check).toBe(true);
    });
  });

  describe("identifier vs keyword disambiguation at type level", () => {
    it("should NOT parse 'nullable' as null (should be identifier)", () => {
      type Result = Parse<TestGrammar, "nullable", TestContext>;
      // Should be an identifier with name "nullable", not a null literal
      type ResultNode = Result extends [infer N, string] ? N : never;
      type IsIdentifier = ResultNode extends { node: "identifier"; name: "nullable" } ? true : false;
      const _check: IsIdentifier = true;
      expect(_check).toBe(true);
    });

    it("should NOT parse 'trueName' as true (should be identifier)", () => {
      type Result = Parse<TestGrammar, "trueName", TestContext>;
      type ResultNode = Result extends [infer N, string] ? N : never;
      type IsIdentifier = ResultNode extends { node: "identifier"; name: "trueName" } ? true : false;
      const _check: IsIdentifier = true;
      expect(_check).toBe(true);
    });

    it("should NOT parse 'falsehood' as false (should be identifier)", () => {
      type Result = Parse<TestGrammar, "falsehood", TestContext>;
      type ResultNode = Result extends [infer N, string] ? N : never;
      type IsIdentifier = ResultNode extends { node: "identifier"; name: "falsehood" } ? true : false;
      const _check: IsIdentifier = true;
      expect(_check).toBe(true);
    });

    it("should NOT parse 'undefinedVar' as undefined (should be identifier)", () => {
      type Result = Parse<TestGrammar, "undefinedVar", TestContext>;
      type ResultNode = Result extends [infer N, string] ? N : never;
      type IsIdentifier = ResultNode extends { node: "identifier"; name: "undefinedVar" } ? true : false;
      const _check: IsIdentifier = true;
      expect(_check).toBe(true);
    });
  });
});

// =============================================================================
// createParser Integration Tests
// =============================================================================

describe("primitive literals - createParser integration", () => {
  describe("with boolean operators", () => {
    const booleanAnd = defineNode({
      name: "and",
      pattern: [lhs("boolean").as("left"), constVal("&&"), rhs("boolean").as("right")],
      precedence: 1,
      resultType: "boolean",
    });

    const booleanOr = defineNode({
      name: "or",
      pattern: [lhs("boolean").as("left"), constVal("||"), rhs("boolean").as("right")],
      precedence: 2,
      resultType: "boolean",
    });

    const parser = createParser([booleanAnd, booleanOr] as const);

    it("should parse 'true && false'", () => {
      const result = parser.parse("true && false", {});
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty("node", "and");
    });

    it("should parse 'false || true'", () => {
      const result = parser.parse("false || true", {});
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty("node", "or");
    });

    it("should parse chained boolean operators", () => {
      const result = parser.parse("true && false || true", {});
      expect(result).toHaveLength(2);
      // Due to precedence (lower = binds looser): && is precedence 1, || is precedence 2
      // So || binds tighter: true && (false || true) -> and node at top
      expect(result[0]).toHaveProperty("node", "and");
    });
  });

  describe("with nullish coalescing", () => {
    const nullishCoalesce = defineNode({
      name: "nullishCoalesce",
      pattern: [lhs().as("left"), constVal("??"), rhs().as("right")],
      precedence: 1,
      resultType: "unknown",
    });

    const parser = createParser([nullishCoalesce] as const);

    it("should parse 'null ?? undefined'", () => {
      const result = parser.parse("null ?? undefined", {});
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty("node", "nullishCoalesce");
      expect((result[0] as any).left).toHaveProperty("outputSchema", "null");
      expect((result[0] as any).right).toHaveProperty("outputSchema", "undefined");
    });

    it("should parse 'undefined ?? 42'", () => {
      const result = parser.parse("undefined ?? 42", {});
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty("node", "nullishCoalesce");
      expect((result[0] as any).left).toHaveProperty("outputSchema", "undefined");
      expect((result[0] as any).right).toHaveProperty("outputSchema", "number");
    });
  });

  describe("with equality operators", () => {
    const strictEqual = defineNode({
      name: "strictEqual",
      pattern: [lhs().as("left"), constVal("==="), rhs().as("right")],
      precedence: 1,
      resultType: "boolean",
    });

    const parser = createParser([strictEqual] as const);

    it("should parse 'null === null'", () => {
      const result = parser.parse("null === null", {});
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty("node", "strictEqual");
    });

    it("should parse 'true === false'", () => {
      const result = parser.parse("true === false", {});
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty("node", "strictEqual");
    });

    it("should parse 'undefined === undefined'", () => {
      const result = parser.parse("undefined === undefined", {});
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty("node", "strictEqual");
    });
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe("primitive literals - edge cases", () => {
  describe("whitespace handling", () => {
    it("should parse null with leading whitespace", () => {
      const result = parse([], "   null", emptyContext);
      // Token.Const consumes leading whitespace
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty("outputSchema", "null");
      expect(result[1]).toBe("");
    });

    it("should parse null followed by space", () => {
      const result = parse([], "null ", emptyContext);
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty("outputSchema", "null");
      expect(result[1]).toBe(" ");
    });

    it("should parse true followed by space", () => {
      const result = parse([], "true ", emptyContext);
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty("outputSchema", "boolean");
      expect(result[1]).toBe(" ");
    });
  });

  describe("case sensitivity", () => {
    it("should NOT parse 'NULL' (uppercase) as null", () => {
      const result = parse([], "NULL", emptyContext);
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty("node", "identifier");
      expect(result[0]).toHaveProperty("name", "NULL");
    });

    it("should NOT parse 'True' (capitalized) as true", () => {
      const result = parse([], "True", emptyContext);
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty("node", "identifier");
      expect(result[0]).toHaveProperty("name", "True");
    });

    it("should NOT parse 'FALSE' (uppercase) as false", () => {
      const result = parse([], "FALSE", emptyContext);
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty("node", "identifier");
      expect(result[0]).toHaveProperty("name", "FALSE");
    });

    it("should NOT parse 'UNDEFINED' (uppercase) as undefined", () => {
      const result = parse([], "UNDEFINED", emptyContext);
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty("node", "identifier");
      expect(result[0]).toHaveProperty("name", "UNDEFINED");
    });
  });

  describe("underscore/dollar prefixes", () => {
    it("should parse identifier starting with underscore before null", () => {
      const result = parse([], "_null", emptyContext);
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty("node", "identifier");
      expect(result[0]).toHaveProperty("name", "_null");
    });

    it("should parse identifier starting with dollar before true", () => {
      const result = parse([], "$true", emptyContext);
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty("node", "identifier");
      expect(result[0]).toHaveProperty("name", "$true");
    });
  });

  describe("number suffix", () => {
    it("should NOT parse 'null0' as null", () => {
      const result = parse([], "null0", emptyContext);
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty("node", "identifier");
      expect(result[0]).toHaveProperty("name", "null0");
    });

    it("should NOT parse 'true1' as true", () => {
      const result = parse([], "true1", emptyContext);
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty("node", "identifier");
      expect(result[0]).toHaveProperty("name", "true1");
    });

    it("should NOT parse 'undefined123' as undefined", () => {
      const result = parse([], "undefined123", emptyContext);
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty("node", "identifier");
      expect(result[0]).toHaveProperty("name", "undefined123");
    });
  });

  describe("adjacent keywords", () => {
    it("should parse 'truenull' as a single identifier", () => {
      const result = parse([], "truenull", emptyContext);
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty("node", "identifier");
      expect(result[0]).toHaveProperty("name", "truenull");
    });

    it("should parse 'nullundefined' as a single identifier", () => {
      const result = parse([], "nullundefined", emptyContext);
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty("node", "identifier");
      expect(result[0]).toHaveProperty("name", "nullundefined");
    });

    it("should parse 'falsetrue' as a single identifier", () => {
      const result = parse([], "falsetrue", emptyContext);
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty("node", "identifier");
      expect(result[0]).toHaveProperty("name", "falsetrue");
    });
  });
});
