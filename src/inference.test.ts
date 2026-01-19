/**
 * Tests for Type Inference (Task 1.6)
 *
 * Tests both:
 * - Runtime infer() function
 * - Static Infer<> type
 * - Inference with complex AST structures
 * - Matching between runtime and type-level inference
 */

import { describe, it, expect } from "vitest";
import {
  defineNode,
  lhs,
  rhs,
  expr,
  constVal,
  createParser,
  infer,
  emptyContext,
} from "./index.js";
import type {
  Infer,
  Context,
  Parse,
  ComputeGrammar,
  BinaryNode,
  NumberNode,
  StringNode,
  IdentNode,
  NullNode,
  BooleanNode,
  UndefinedNode,
} from "./index.js";
import { typeCheck, type AssertEqual } from "./test-helpers.js";

// =============================================================================
// Grammar Definition for Testing
// =============================================================================

const add = defineNode({
  name: "add",
  pattern: [lhs("number").as("left"), constVal("+"), rhs("number").as("right")],
  precedence: 1,
  resultType: "number",
});

const mul = defineNode({
  name: "mul",
  pattern: [lhs("number").as("left"), constVal("*"), rhs("number").as("right")],
  precedence: 2,
  resultType: "number",
});

const eq = defineNode({
  name: "eq",
  pattern: [lhs("string").as("left"), constVal("=="), rhs("string").as("right")],
  precedence: 0,
  resultType: "boolean",
});

const concat = defineNode({
  name: "concat",
  pattern: [lhs("string").as("left"), constVal("++"), rhs("string").as("right")],
  precedence: 1,
  resultType: "string",
});

const nullCoalesce = defineNode({
  name: "nullCoalesce",
  pattern: [lhs().as("left"), constVal("??"), rhs().as("right")],
  precedence: 0,
  resultType: "unknown",
});

const ternary = defineNode({
  name: "ternary",
  pattern: [
    lhs("boolean").as("condition"),
    constVal("?"),
    expr().as("then"),
    constVal(":"),
    rhs().as("else"),
  ],
  precedence: 0,
  resultType: "unknown",
});

const operators = [add, mul, eq, concat, nullCoalesce, ternary] as const;
const parser = createParser(operators);

type Grammar = ComputeGrammar<typeof operators>;
type Ctx = Context<{}>;
type CtxWithVars = Context<{ x: "number"; y: "number"; name: "string"; flag: "boolean" }>;

// =============================================================================
// Runtime infer() Function Tests
// =============================================================================

describe("runtime infer() function", () => {
  describe("literal nodes", () => {
    it("should infer number literal as 'number'", () => {
      const result = parser.parse("42", {});
      expect(result.length).toBe(2);
      const type = infer(result[0], emptyContext);
      expect(type).toBe("number");
    });

    it("should infer decimal number as 'number'", () => {
      const result = parser.parse("3.14", {});
      expect(result.length).toBe(2);
      const type = infer(result[0], emptyContext);
      expect(type).toBe("number");
    });

    it("should infer string literal as 'string'", () => {
      const result = parser.parse('"hello"', {});
      expect(result.length).toBe(2);
      const type = infer(result[0], emptyContext);
      expect(type).toBe("string");
    });

    it("should infer single-quoted string as 'string'", () => {
      const result = parser.parse("'world'", {});
      expect(result.length).toBe(2);
      const type = infer(result[0], emptyContext);
      expect(type).toBe("string");
    });

    it("should infer empty string as 'string'", () => {
      const result = parser.parse('""', {});
      expect(result.length).toBe(2);
      const type = infer(result[0], emptyContext);
      expect(type).toBe("string");
    });

    it("should infer true as 'boolean'", () => {
      const result = parser.parse("true", {});
      expect(result.length).toBe(2);
      const type = infer(result[0], emptyContext);
      expect(type).toBe("boolean");
    });

    it("should infer false as 'boolean'", () => {
      const result = parser.parse("false", {});
      expect(result.length).toBe(2);
      const type = infer(result[0], emptyContext);
      expect(type).toBe("boolean");
    });

    it("should infer null as 'null'", () => {
      const result = parser.parse("null", {});
      expect(result.length).toBe(2);
      const type = infer(result[0], emptyContext);
      expect(type).toBe("null");
    });

    it("should infer undefined as 'undefined'", () => {
      const result = parser.parse("undefined", {});
      expect(result.length).toBe(2);
      const type = infer(result[0], emptyContext);
      expect(type).toBe("undefined");
    });
  });

  describe("identifier nodes", () => {
    it("should infer identifier with known type from context", () => {
      const result = parser.parse("x", { x: "number" });
      expect(result.length).toBe(2);
      const type = infer(result[0], emptyContext);
      expect(type).toBe("number");
    });

    it("should infer identifier without context as 'unknown'", () => {
      // Use a simpler parser for this test (without constraints)
      const simpleParser = createParser([]);
      const result = simpleParser.parse("unknownVar", {});
      expect(result.length).toBe(2);
      const type = infer(result[0], emptyContext);
      expect(type).toBe("unknown");
    });

    it("should infer multiple different identifier types", () => {
      const result1 = parser.parse("x", { x: "number" });
      const result2 = parser.parse("name", { name: "string" });

      expect(infer(result1[0], emptyContext)).toBe("number");
      expect(infer(result2[0], emptyContext)).toBe("string");
    });
  });

  describe("binary operation nodes", () => {
    it("should infer add operation as 'number'", () => {
      const result = parser.parse("1+2", {});
      expect(result.length).toBe(2);
      const type = infer(result[0], emptyContext);
      expect(type).toBe("number");
    });

    it("should infer mul operation as 'number'", () => {
      const result = parser.parse("3*4", {});
      expect(result.length).toBe(2);
      const type = infer(result[0], emptyContext);
      expect(type).toBe("number");
    });

    it("should infer eq operation as 'boolean'", () => {
      const result = parser.parse('"a"=="b"', {});
      expect(result.length).toBe(2);
      const type = infer(result[0], emptyContext);
      expect(type).toBe("boolean");
    });

    it("should infer concat operation as 'string'", () => {
      const result = parser.parse('"hello"++"world"', {});
      expect(result.length).toBe(2);
      const type = infer(result[0], emptyContext);
      expect(type).toBe("string");
    });

    it("should infer nullCoalesce as 'unknown'", () => {
      const result = parser.parse("null??42", {});
      expect(result.length).toBe(2);
      const type = infer(result[0], emptyContext);
      expect(type).toBe("unknown");
    });

    it("should infer chained additions as 'number'", () => {
      const result = parser.parse("1+2+3", {});
      expect(result.length).toBe(2);
      const type = infer(result[0], emptyContext);
      expect(type).toBe("number");
    });

    it("should infer mixed precedence expressions correctly", () => {
      const result = parser.parse("1+2*3", {});
      expect(result.length).toBe(2);
      const type = infer(result[0], emptyContext);
      expect(type).toBe("number");
    });
  });

  describe("parenthesized expressions", () => {
    it("should infer through parentheses - number", () => {
      const result = parser.parse("(42)", {});
      expect(result.length).toBe(2);
      const type = infer(result[0], emptyContext);
      expect(type).toBe("number");
    });

    it("should infer through parentheses - string", () => {
      const result = parser.parse('("hello")', {});
      expect(result.length).toBe(2);
      const type = infer(result[0], emptyContext);
      expect(type).toBe("string");
    });

    it("should infer through nested parentheses", () => {
      const result = parser.parse("((1+2))", {});
      expect(result.length).toBe(2);
      const type = infer(result[0], emptyContext);
      expect(type).toBe("number");
    });

    it("should infer through parentheses with precedence override", () => {
      const result = parser.parse("(1+2)*3", {});
      expect(result.length).toBe(2);
      const type = infer(result[0], emptyContext);
      expect(type).toBe("number");
    });
  });

  describe("complex AST structures", () => {
    it("should infer deeply nested expression", () => {
      const result = parser.parse("1+2*3+4*5", {});
      expect(result.length).toBe(2);
      const type = infer(result[0], emptyContext);
      expect(type).toBe("number");
    });

    it("should infer expression with variables", () => {
      const result = parser.parse("x+y*2", { x: "number", y: "number" });
      expect(result.length).toBe(2);
      const type = infer(result[0], emptyContext);
      expect(type).toBe("number");
    });

    it("should infer string concatenation chain", () => {
      const result = parser.parse('"a"++"b"++"c"', {});
      expect(result.length).toBe(2);
      const type = infer(result[0], emptyContext);
      expect(type).toBe("string");
    });

    it("should infer equality comparison with strings", () => {
      const result = parser.parse('"foo"=="bar"', {});
      expect(result.length).toBe(2);
      const type = infer(result[0], emptyContext);
      expect(type).toBe("boolean");
    });

    it("should infer ternary expression", () => {
      const result = parser.parse("true?1:2", {});
      expect(result.length).toBe(2);
      const type = infer(result[0], emptyContext);
      expect(type).toBe("unknown");
    });

    it("should infer nested ternary", () => {
      const result = parser.parse("true?1:false?2:3", {});
      expect(result.length).toBe(2);
      const type = infer(result[0], emptyContext);
      expect(type).toBe("unknown");
    });
  });

  describe("error cases", () => {
    it("should throw for null AST", () => {
      expect(() => infer(null, emptyContext)).toThrow("Invalid AST node");
    });

    it("should throw for undefined AST", () => {
      expect(() => infer(undefined, emptyContext)).toThrow("Invalid AST node");
    });

    it("should throw for primitive AST (number)", () => {
      expect(() => infer(42, emptyContext)).toThrow("Invalid AST node");
    });

    it("should throw for primitive AST (string)", () => {
      expect(() => infer("not a node", emptyContext)).toThrow("Invalid AST node");
    });

    it("should throw for primitive AST (boolean)", () => {
      expect(() => infer(true, emptyContext)).toThrow("Invalid AST node");
    });

    it("should throw for object without outputSchema", () => {
      expect(() => infer({ node: "test" }, emptyContext)).toThrow("AST node has no outputSchema");
    });

    it("should throw for object with non-string outputSchema", () => {
      expect(() => infer({ node: "test", outputSchema: 123 }, emptyContext)).toThrow("AST node has no outputSchema");
    });
  });
});

// =============================================================================
// Static Infer<> Type Tests
// =============================================================================

describe("static Infer<> type", () => {
  describe("literal node types", () => {
    it("should infer NumberNode as 'number'", () => {
      type R = Infer<NumberNode<"42">, Ctx>;
      type T = AssertEqual<R, "number">;
      typeCheck<T>(true);
    });

    it("should infer StringNode as 'string'", () => {
      type R = Infer<StringNode<"hello">, Ctx>;
      type T = AssertEqual<R, "string">;
      typeCheck<T>(true);
    });

    it("should infer NullNode as 'null'", () => {
      type R = Infer<NullNode, Ctx>;
      type T = AssertEqual<R, "null">;
      typeCheck<T>(true);
    });

    it("should infer BooleanNode<'true'> as 'boolean'", () => {
      type R = Infer<BooleanNode<"true">, Ctx>;
      type T = AssertEqual<R, "boolean">;
      typeCheck<T>(true);
    });

    it("should infer BooleanNode<'false'> as 'boolean'", () => {
      type R = Infer<BooleanNode<"false">, Ctx>;
      type T = AssertEqual<R, "boolean">;
      typeCheck<T>(true);
    });

    it("should infer UndefinedNode as 'undefined'", () => {
      type R = Infer<UndefinedNode, Ctx>;
      type T = AssertEqual<R, "undefined">;
      typeCheck<T>(true);
    });
  });

  describe("identifier node types", () => {
    it("should infer IdentNode with known type", () => {
      type R = Infer<IdentNode<"x", "number">, Ctx>;
      type T = AssertEqual<R, "number">;
      typeCheck<T>(true);
    });

    it("should infer IdentNode with string type", () => {
      type R = Infer<IdentNode<"name", "string">, Ctx>;
      type T = AssertEqual<R, "string">;
      typeCheck<T>(true);
    });

    it("should infer IdentNode with unknown type", () => {
      type R = Infer<IdentNode<"unknown", "unknown">, Ctx>;
      type T = AssertEqual<R, "unknown">;
      typeCheck<T>(true);
    });
  });

  describe("binary node types", () => {
    it("should infer BinaryNode with number output", () => {
      type R = Infer<BinaryNode<"add", NumberNode<"1">, NumberNode<"2">, "number">, Ctx>;
      type T = AssertEqual<R, "number">;
      typeCheck<T>(true);
    });

    it("should infer BinaryNode with boolean output", () => {
      type R = Infer<BinaryNode<"eq", StringNode<"a">, StringNode<"b">, "boolean">, Ctx>;
      type T = AssertEqual<R, "boolean">;
      typeCheck<T>(true);
    });

    it("should infer BinaryNode with string output", () => {
      type R = Infer<BinaryNode<"concat", StringNode<"a">, StringNode<"b">, "string">, Ctx>;
      type T = AssertEqual<R, "string">;
      typeCheck<T>(true);
    });

    it("should infer nested BinaryNodes", () => {
      type Inner = BinaryNode<"mul", NumberNode<"2">, NumberNode<"3">, "number">;
      type Outer = BinaryNode<"add", NumberNode<"1">, Inner, "number">;
      type R = Infer<Outer, Ctx>;
      type T = AssertEqual<R, "number">;
      typeCheck<T>(true);
    });
  });

  describe("parsed expression types", () => {
    it("should infer parsed number literal", () => {
      type Parsed = Parse<Grammar, "42", Ctx>;
      type Node = Parsed extends [infer N, string] ? N : never;
      type R = Infer<Node, Ctx>;
      type T = AssertEqual<R, "number">;
      typeCheck<T>(true);
    });

    it("should infer parsed string literal", () => {
      type Parsed = Parse<Grammar, '"hello"', Ctx>;
      type Node = Parsed extends [infer N, string] ? N : never;
      type R = Infer<Node, Ctx>;
      type T = AssertEqual<R, "string">;
      typeCheck<T>(true);
    });

    it("should infer parsed boolean literal", () => {
      type Parsed = Parse<Grammar, "true", Ctx>;
      type Node = Parsed extends [infer N, string] ? N : never;
      type R = Infer<Node, Ctx>;
      type T = AssertEqual<R, "boolean">;
      typeCheck<T>(true);
    });

    it("should infer parsed addition", () => {
      type Parsed = Parse<Grammar, "1+2", Ctx>;
      type Node = Parsed extends [infer N, string] ? N : never;
      type R = Infer<Node, Ctx>;
      type T = AssertEqual<R, "number">;
      typeCheck<T>(true);
    });

    it("should infer parsed multiplication", () => {
      type Parsed = Parse<Grammar, "3*4", Ctx>;
      type Node = Parsed extends [infer N, string] ? N : never;
      type R = Infer<Node, Ctx>;
      type T = AssertEqual<R, "number">;
      typeCheck<T>(true);
    });

    it("should infer parsed string equality", () => {
      type Parsed = Parse<Grammar, '"a"=="b"', Ctx>;
      type Node = Parsed extends [infer N, string] ? N : never;
      type R = Infer<Node, Ctx>;
      type T = AssertEqual<R, "boolean">;
      typeCheck<T>(true);
    });

    it("should infer parsed string concat", () => {
      type Parsed = Parse<Grammar, '"a"++"b"', Ctx>;
      type Node = Parsed extends [infer N, string] ? N : never;
      type R = Infer<Node, Ctx>;
      type T = AssertEqual<R, "string">;
      typeCheck<T>(true);
    });

    it("should infer parsed identifier with context", () => {
      type Parsed = Parse<Grammar, "x", CtxWithVars>;
      type Node = Parsed extends [infer N, string] ? N : never;
      type R = Infer<Node, CtxWithVars>;
      type T = AssertEqual<R, "number">;
      typeCheck<T>(true);
    });

    it("should infer parsed complex expression", () => {
      type Parsed = Parse<Grammar, "1+2*3", Ctx>;
      type Node = Parsed extends [infer N, string] ? N : never;
      type R = Infer<Node, Ctx>;
      type T = AssertEqual<R, "number">;
      typeCheck<T>(true);
    });
  });

  describe("edge cases", () => {
    // Use a helper type to check if a type is never
    // This is needed because AssertEqual<never, never> has special behavior
    type IsNever<T> = [T] extends [never] ? true : false;

    it("should return never for non-AST types", () => {
      type R = Infer<string, Ctx>;
      type T = IsNever<R>;
      typeCheck<T>(true);
    });

    it("should return never for number type", () => {
      type R = Infer<number, Ctx>;
      type T = IsNever<R>;
      typeCheck<T>(true);
    });

    it("should return never for null type", () => {
      type R = Infer<null, Ctx>;
      type T = IsNever<R>;
      typeCheck<T>(true);
    });

    it("should return never for undefined type", () => {
      type R = Infer<undefined, Ctx>;
      type T = IsNever<R>;
      typeCheck<T>(true);
    });

    it("should return never for object without outputSchema", () => {
      type R = Infer<{ node: "test" }, Ctx>;
      type T = IsNever<R>;
      typeCheck<T>(true);
    });
  });
});

// =============================================================================
// Runtime/Type Parity Tests
// =============================================================================

describe("runtime/type inference parity", () => {
  it("should match for number literal", () => {
    const result = parser.parse("42", {});
    const runtimeType = infer(result[0], emptyContext);

    type Parsed = Parse<Grammar, "42", Ctx>;
    type Node = Parsed extends [infer N, string] ? N : never;
    type StaticType = Infer<Node, Ctx>;
    type T = AssertEqual<StaticType, "number">;
    typeCheck<T>(true);

    expect(runtimeType).toBe("number" satisfies StaticType);
  });

  it("should match for string literal", () => {
    const result = parser.parse('"test"', {});
    const runtimeType = infer(result[0], emptyContext);

    type Parsed = Parse<Grammar, '"test"', Ctx>;
    type Node = Parsed extends [infer N, string] ? N : never;
    type StaticType = Infer<Node, Ctx>;
    type T = AssertEqual<StaticType, "string">;
    typeCheck<T>(true);

    expect(runtimeType).toBe("string" satisfies StaticType);
  });

  it("should match for boolean literal", () => {
    const result = parser.parse("true", {});
    const runtimeType = infer(result[0], emptyContext);

    type Parsed = Parse<Grammar, "true", Ctx>;
    type Node = Parsed extends [infer N, string] ? N : never;
    type StaticType = Infer<Node, Ctx>;
    type T = AssertEqual<StaticType, "boolean">;
    typeCheck<T>(true);

    expect(runtimeType).toBe("boolean" satisfies StaticType);
  });

  it("should match for null literal", () => {
    const result = parser.parse("null", {});
    const runtimeType = infer(result[0], emptyContext);

    type Parsed = Parse<Grammar, "null", Ctx>;
    type Node = Parsed extends [infer N, string] ? N : never;
    type StaticType = Infer<Node, Ctx>;
    type T = AssertEqual<StaticType, "null">;
    typeCheck<T>(true);

    expect(runtimeType).toBe("null" satisfies StaticType);
  });

  it("should match for undefined literal", () => {
    const result = parser.parse("undefined", {});
    const runtimeType = infer(result[0], emptyContext);

    type Parsed = Parse<Grammar, "undefined", Ctx>;
    type Node = Parsed extends [infer N, string] ? N : never;
    type StaticType = Infer<Node, Ctx>;
    type T = AssertEqual<StaticType, "undefined">;
    typeCheck<T>(true);

    expect(runtimeType).toBe("undefined" satisfies StaticType);
  });

  it("should match for addition", () => {
    const result = parser.parse("1+2", {});
    const runtimeType = infer(result[0], emptyContext);

    type Parsed = Parse<Grammar, "1+2", Ctx>;
    type Node = Parsed extends [infer N, string] ? N : never;
    type StaticType = Infer<Node, Ctx>;
    type T = AssertEqual<StaticType, "number">;
    typeCheck<T>(true);

    expect(runtimeType).toBe("number" satisfies StaticType);
  });

  it("should match for multiplication", () => {
    const result = parser.parse("3*4", {});
    const runtimeType = infer(result[0], emptyContext);

    type Parsed = Parse<Grammar, "3*4", Ctx>;
    type Node = Parsed extends [infer N, string] ? N : never;
    type StaticType = Infer<Node, Ctx>;
    type T = AssertEqual<StaticType, "number">;
    typeCheck<T>(true);

    expect(runtimeType).toBe("number" satisfies StaticType);
  });

  it("should match for string equality", () => {
    const result = parser.parse('"a"=="b"', {});
    const runtimeType = infer(result[0], emptyContext);

    type Parsed = Parse<Grammar, '"a"=="b"', Ctx>;
    type Node = Parsed extends [infer N, string] ? N : never;
    type StaticType = Infer<Node, Ctx>;
    type T = AssertEqual<StaticType, "boolean">;
    typeCheck<T>(true);

    expect(runtimeType).toBe("boolean" satisfies StaticType);
  });

  it("should match for string concatenation", () => {
    const result = parser.parse('"x"++"y"', {});
    const runtimeType = infer(result[0], emptyContext);

    type Parsed = Parse<Grammar, '"x"++"y"', Ctx>;
    type Node = Parsed extends [infer N, string] ? N : never;
    type StaticType = Infer<Node, Ctx>;
    type T = AssertEqual<StaticType, "string">;
    typeCheck<T>(true);

    expect(runtimeType).toBe("string" satisfies StaticType);
  });

  it("should match for complex expression", () => {
    const result = parser.parse("1+2*3", {});
    const runtimeType = infer(result[0], emptyContext);

    type Parsed = Parse<Grammar, "1+2*3", Ctx>;
    type Node = Parsed extends [infer N, string] ? N : never;
    type StaticType = Infer<Node, Ctx>;
    type T = AssertEqual<StaticType, "number">;
    typeCheck<T>(true);

    expect(runtimeType).toBe("number" satisfies StaticType);
  });

  it("should match for identifier with context", () => {
    const result = parser.parse("x", { x: "number" });
    const runtimeType = infer(result[0], emptyContext);

    type Parsed = Parse<Grammar, "x", CtxWithVars>;
    type Node = Parsed extends [infer N, string] ? N : never;
    type StaticType = Infer<Node, CtxWithVars>;
    type T = AssertEqual<StaticType, "number">;
    typeCheck<T>(true);

    expect(runtimeType).toBe("number" satisfies StaticType);
  });

  it("should match for expression with identifier", () => {
    const result = parser.parse("x+1", { x: "number" });
    const runtimeType = infer(result[0], emptyContext);

    type Parsed = Parse<Grammar, "x+1", CtxWithVars>;
    type Node = Parsed extends [infer N, string] ? N : never;
    type StaticType = Infer<Node, CtxWithVars>;
    type T = AssertEqual<StaticType, "number">;
    typeCheck<T>(true);

    expect(runtimeType).toBe("number" satisfies StaticType);
  });
});

// =============================================================================
// Complex AST Structure Tests
// =============================================================================

describe("complex AST structure inference", () => {
  describe("deeply nested expressions", () => {
    it("should handle 5 levels of addition", () => {
      const result = parser.parse("1+2+3+4+5", {});
      expect(result.length).toBe(2);
      expect(infer(result[0], emptyContext)).toBe("number");
    });

    it("should handle 5 levels of multiplication", () => {
      const result = parser.parse("1*2*3*4*5", {});
      expect(result.length).toBe(2);
      expect(infer(result[0], emptyContext)).toBe("number");
    });

    it("should handle nested parentheses with operators", () => {
      const result = parser.parse("((1+2)*3)+4", {});
      expect(result.length).toBe(2);
      expect(infer(result[0], emptyContext)).toBe("number");
    });

    it("should handle triple nested parentheses", () => {
      const result = parser.parse("(((1)))", {});
      expect(result.length).toBe(2);
      expect(infer(result[0], emptyContext)).toBe("number");
    });
  });

  describe("mixed type operations", () => {
    it("should handle string concat followed by comparison (left-to-right)", () => {
      // Note: concat has higher precedence than eq, so this parses as ("a"++"b") == "ab"
      const result = parser.parse('"a"++"b"=="ab"', {});
      expect(result.length).toBe(2);
      expect(infer(result[0], emptyContext)).toBe("boolean");
    });

    it("should handle arithmetic with variables", () => {
      const result = parser.parse("x*y+1", { x: "number", y: "number" });
      expect(result.length).toBe(2);
      expect(infer(result[0], emptyContext)).toBe("number");
    });

    it("should handle string variables in concat", () => {
      const result = parser.parse('name++"!"', { name: "string" });
      expect(result.length).toBe(2);
      expect(infer(result[0], emptyContext)).toBe("string");
    });
  });

  describe("ternary expressions", () => {
    it("should infer ternary with number branches", () => {
      const result = parser.parse("true?1:2", {});
      expect(result.length).toBe(2);
      expect(infer(result[0], emptyContext)).toBe("unknown");
    });

    it("should infer ternary with string branches", () => {
      const result = parser.parse('true?"yes":"no"', {});
      expect(result.length).toBe(2);
      expect(infer(result[0], emptyContext)).toBe("unknown");
    });

    it("should infer ternary with mixed branches", () => {
      const result = parser.parse('false?1:"one"', {});
      expect(result.length).toBe(2);
      expect(infer(result[0], emptyContext)).toBe("unknown");
    });

    it("should infer nested ternary expressions", () => {
      const result = parser.parse("true?false?1:2:3", {});
      expect(result.length).toBe(2);
      expect(infer(result[0], emptyContext)).toBe("unknown");
    });
  });

  describe("null coalescing", () => {
    it("should infer null coalesce with number fallback", () => {
      const result = parser.parse("null??42", {});
      expect(result.length).toBe(2);
      expect(infer(result[0], emptyContext)).toBe("unknown");
    });

    it("should infer null coalesce with string fallback", () => {
      const result = parser.parse('undefined??"default"', {});
      expect(result.length).toBe(2);
      expect(infer(result[0], emptyContext)).toBe("unknown");
    });

    it("should infer chained null coalesce", () => {
      const result = parser.parse("null??undefined??1", {});
      expect(result.length).toBe(2);
      expect(infer(result[0], emptyContext)).toBe("unknown");
    });
  });
});
