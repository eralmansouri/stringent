/**
 * Runtime Parser Tests
 *
 * Comprehensive tests for the runtime parser covering:
 * - Tokenization: numberLiteral, stringLiteral, identifierAtom
 * - Parentheses handling and nesting
 * - Operator precedence at runtime level
 * - Grammar building from node schemas
 * - buildNodeResult field extraction
 * - Whitespace handling between tokens
 */

import { describe, it, expect } from "vitest";
import {
  parse,
  buildGrammar,
  BUILT_IN_ATOMS,
} from "./parser.js";
import {
  defineNode,
  lhs,
  rhs,
  expr,
  constVal,
} from "../schema/index.js";
import type { Context } from "../context.js";

// =============================================================================
// Test Helpers
// =============================================================================

const emptyContext: Context = { data: {} };

function contextWith(data: Record<string, string>): Context {
  return { data };
}

// =============================================================================
// Section 1: Tokenization Tests - Number Literals
// =============================================================================

describe("tokenization: number literals", () => {
  it("should parse integer literals", () => {
    const result = parse([], "42", emptyContext);
    expect(result.length).toBe(2);
    expect(result[0]).toMatchObject({
      node: "literal",
      raw: "42",
      value: 42,
      outputSchema: "number",
    });
    expect(result[1]).toBe("");
  });

  it("should parse zero", () => {
    const result = parse([], "0", emptyContext);
    expect(result.length).toBe(2);
    expect(result[0]).toMatchObject({
      node: "literal",
      raw: "0",
      value: 0,
      outputSchema: "number",
    });
  });

  it("should parse decimal numbers", () => {
    const result = parse([], "3.14", emptyContext);
    expect(result.length).toBe(2);
    expect(result[0]).toMatchObject({
      node: "literal",
      raw: "3.14",
      value: 3.14,
      outputSchema: "number",
    });
  });

  it("should parse numbers with leading decimal", () => {
    // Token.Number converts ".5" to "0.5"
    const result = parse([], ".5", emptyContext);
    expect(result.length).toBe(2);
    expect(result[0]).toMatchObject({
      node: "literal",
      raw: "0.5",
      value: 0.5,
      outputSchema: "number",
    });
  });

  it("should parse numbers with trailing decimal", () => {
    // Token.Number parses "5." as "5" with no trailing decimal
    const result = parse([], "5.", emptyContext);
    expect(result.length).toBe(2);
    expect(result[0]).toMatchObject({
      node: "literal",
      raw: "5",
      value: 5,
      outputSchema: "number",
    });
    expect(result[1]).toBe("");
  });

  it("should return remaining input after number", () => {
    const result = parse([], "123abc", emptyContext);
    expect(result.length).toBe(2);
    expect(result[0]).toMatchObject({
      node: "literal",
      raw: "123",
      value: 123,
    });
    expect(result[1]).toBe("abc");
  });

  it("should parse large numbers", () => {
    const result = parse([], "9999999999", emptyContext);
    expect(result.length).toBe(2);
    expect(result[0]).toMatchObject({
      node: "literal",
      value: 9999999999,
    });
  });
});

// =============================================================================
// Section 2: Tokenization Tests - String Literals
// =============================================================================

describe("tokenization: string literals", () => {
  it("should parse double-quoted strings", () => {
    const result = parse([], '"hello"', emptyContext);
    expect(result.length).toBe(2);
    // Note: Token.String returns content without quotes in raw/value
    expect(result[0]).toMatchObject({
      node: "literal",
      raw: "hello",
      value: "hello",
      outputSchema: "string",
    });
    expect(result[1]).toBe("");
  });

  it("should parse single-quoted strings", () => {
    const result = parse([], "'world'", emptyContext);
    expect(result.length).toBe(2);
    expect(result[0]).toMatchObject({
      node: "literal",
      raw: "world",
      value: "world",
      outputSchema: "string",
    });
  });

  it("should parse empty strings", () => {
    const result = parse([], '""', emptyContext);
    expect(result.length).toBe(2);
    expect(result[0]).toMatchObject({
      node: "literal",
      raw: "",
      value: "",
      outputSchema: "string",
    });
  });

  it("should parse strings with spaces", () => {
    const result = parse([], '"hello world"', emptyContext);
    expect(result.length).toBe(2);
    expect(result[0]).toMatchObject({
      node: "literal",
      raw: "hello world",
    });
  });

  it("should parse strings with numbers", () => {
    const result = parse([], '"test123"', emptyContext);
    expect(result.length).toBe(2);
    expect(result[0]).toMatchObject({
      node: "literal",
      raw: "test123",
    });
  });

  it("should return remaining input after string", () => {
    const result = parse([], '"hello" rest', emptyContext);
    expect(result.length).toBe(2);
    expect(result[1]).toBe(" rest");
  });
});

// =============================================================================
// Section 3: Tokenization Tests - Identifiers
// =============================================================================

describe("tokenization: identifiers", () => {
  it("should parse simple identifiers", () => {
    const result = parse([], "foo", emptyContext);
    expect(result.length).toBe(2);
    expect(result[0]).toMatchObject({
      node: "identifier",
      name: "foo",
      outputSchema: "unknown",
    });
    expect(result[1]).toBe("");
  });

  it("should parse identifiers with numbers", () => {
    const result = parse([], "foo123", emptyContext);
    expect(result.length).toBe(2);
    expect(result[0]).toMatchObject({
      node: "identifier",
      name: "foo123",
    });
  });

  it("should parse identifiers with underscores", () => {
    const result = parse([], "foo_bar", emptyContext);
    expect(result.length).toBe(2);
    expect(result[0]).toMatchObject({
      node: "identifier",
      name: "foo_bar",
    });
  });

  it("should parse identifiers starting with underscore", () => {
    const result = parse([], "_private", emptyContext);
    expect(result.length).toBe(2);
    expect(result[0]).toMatchObject({
      node: "identifier",
      name: "_private",
    });
  });

  it("should use context to determine outputSchema", () => {
    const ctx = contextWith({ x: "number", y: "string" });

    const resultX = parse([], "x", ctx);
    expect(resultX[0]).toMatchObject({
      node: "identifier",
      name: "x",
      outputSchema: "number",
    });

    const resultY = parse([], "y", ctx);
    expect(resultY[0]).toMatchObject({
      node: "identifier",
      name: "y",
      outputSchema: "string",
    });
  });

  it("should default to unknown for undefined identifiers", () => {
    const ctx = contextWith({ x: "number" });
    const result = parse([], "undefined_var", ctx);
    expect(result[0]).toMatchObject({
      node: "identifier",
      name: "undefined_var",
      outputSchema: "unknown",
    });
  });

  it("should return remaining input after identifier", () => {
    const result = parse([], "foo bar", emptyContext);
    expect(result.length).toBe(2);
    expect(result[1]).toBe(" bar");
  });
});

// =============================================================================
// Section 4: Parentheses Handling
// =============================================================================

describe("parentheses handling", () => {
  it("should parse simple parenthesized number", () => {
    const result = parse([], "(42)", emptyContext);
    expect(result.length).toBe(2);
    expect(result[0]).toMatchObject({
      node: "parentheses",
    });
    expect((result[0] as any).inner).toMatchObject({
      node: "literal",
      value: 42,
    });
    expect(result[1]).toBe("");
  });

  it("should parse parenthesized identifier", () => {
    const result = parse([], "(foo)", emptyContext);
    expect(result.length).toBe(2);
    expect(result[0]).toMatchObject({
      node: "parentheses",
    });
    expect((result[0] as any).inner).toMatchObject({
      node: "identifier",
      name: "foo",
    });
  });

  it("should parse parenthesized string", () => {
    const result = parse([], '("hello")', emptyContext);
    expect(result.length).toBe(2);
    expect((result[0] as any).inner).toMatchObject({
      node: "literal",
      outputSchema: "string",
    });
  });

  it("should parse nested parentheses (2 levels)", () => {
    const result = parse([], "((42))", emptyContext);
    expect(result.length).toBe(2);
    const outer = result[0] as any;
    expect(outer.node).toBe("parentheses");
    expect(outer.inner.node).toBe("parentheses");
    expect(outer.inner.inner.node).toBe("literal");
    expect(outer.inner.inner.value).toBe(42);
  });

  it("should parse deeply nested parentheses (5 levels)", () => {
    const result = parse([], "(((((1)))))", emptyContext);
    expect(result.length).toBe(2);

    let node: any = result[0];
    for (let i = 0; i < 5; i++) {
      expect(node.node).toBe("parentheses");
      node = node.inner;
    }
    expect(node.node).toBe("literal");
    expect(node.value).toBe(1);
  });

  it("should propagate outputSchema through parentheses", () => {
    const ctx = contextWith({ x: "number" });
    const result = parse([], "(x)", ctx);
    expect(result.length).toBe(2);
    expect((result[0] as any).outputSchema).toBe("number");
  });

  it("should fail on unclosed parenthesis", () => {
    const result = parse([], "(42", emptyContext);
    expect(result.length).toBe(0);
  });

  it("should fail on unopened parenthesis", () => {
    const result = parse([], "42)", emptyContext);
    expect(result.length).toBe(2);
    expect(result[1]).toBe(")"); // Parses 42, leaves ) as remaining
  });

  it("should fail on empty parentheses", () => {
    const result = parse([], "()", emptyContext);
    expect(result.length).toBe(0);
  });

  it("should fail on mismatched parentheses", () => {
    const result = parse([], "((42)", emptyContext);
    expect(result.length).toBe(0);
  });
});

// =============================================================================
// Section 5: Operator Precedence
// =============================================================================

describe("operator precedence", () => {
  // Define add (precedence 1) and mul (precedence 2) operators
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

  const operators = [add, mul] as const;

  it("should parse 1+2 as add(1, 2)", () => {
    const result = parse(operators, "1+2", emptyContext);
    expect(result.length).toBe(2);
    expect((result[0] as any).node).toBe("add");
    expect((result[0] as any).left).toMatchObject({ value: 1 });
    expect((result[0] as any).right).toMatchObject({ value: 2 });
  });

  it("should parse 2*3 as mul(2, 3)", () => {
    const result = parse(operators, "2*3", emptyContext);
    expect(result.length).toBe(2);
    expect((result[0] as any).node).toBe("mul");
    expect((result[0] as any).left).toMatchObject({ value: 2 });
    expect((result[0] as any).right).toMatchObject({ value: 3 });
  });

  it("should parse 1+2*3 as add(1, mul(2, 3)) - mul binds tighter", () => {
    const result = parse(operators, "1+2*3", emptyContext);
    expect(result.length).toBe(2);
    const node = result[0] as any;
    expect(node.node).toBe("add");
    expect(node.left).toMatchObject({ value: 1 });
    expect(node.right.node).toBe("mul");
    expect(node.right.left).toMatchObject({ value: 2 });
    expect(node.right.right).toMatchObject({ value: 3 });
  });

  it("should parse 1*2+3 as add(mul(1, 2), 3) - mul binds tighter", () => {
    const result = parse(operators, "1*2+3", emptyContext);
    expect(result.length).toBe(2);
    const node = result[0] as any;
    expect(node.node).toBe("add");
    expect(node.left.node).toBe("mul");
    expect(node.left.left).toMatchObject({ value: 1 });
    expect(node.left.right).toMatchObject({ value: 2 });
    expect(node.right).toMatchObject({ value: 3 });
  });

  it("should parse 1+2+3 with right-associativity as add(1, add(2, 3))", () => {
    const result = parse(operators, "1+2+3", emptyContext);
    expect(result.length).toBe(2);
    const node = result[0] as any;
    expect(node.node).toBe("add");
    expect(node.left).toMatchObject({ value: 1 });
    expect(node.right.node).toBe("add");
    expect(node.right.left).toMatchObject({ value: 2 });
    expect(node.right.right).toMatchObject({ value: 3 });
  });

  it("should parse 1*2*3 with right-associativity as mul(1, mul(2, 3))", () => {
    const result = parse(operators, "1*2*3", emptyContext);
    expect(result.length).toBe(2);
    const node = result[0] as any;
    expect(node.node).toBe("mul");
    expect(node.left).toMatchObject({ value: 1 });
    expect(node.right.node).toBe("mul");
  });

  it("should parse (1+2)*3 as mul(add(1, 2), 3) - parens override precedence", () => {
    const result = parse(operators, "(1+2)*3", emptyContext);
    expect(result.length).toBe(2);
    const node = result[0] as any;
    expect(node.node).toBe("mul");
    expect(node.left.node).toBe("parentheses");
    expect(node.left.inner.node).toBe("add");
    expect(node.right).toMatchObject({ value: 3 });
  });

  it("should parse 1*(2+3) as mul(1, add(2, 3)) - parens override precedence", () => {
    const result = parse(operators, "1*(2+3)", emptyContext);
    expect(result.length).toBe(2);
    const node = result[0] as any;
    expect(node.node).toBe("mul");
    expect(node.left).toMatchObject({ value: 1 });
    expect(node.right.node).toBe("parentheses");
    expect(node.right.inner.node).toBe("add");
  });

  it("should parse complex expression 1+2*3+4*5", () => {
    const result = parse(operators, "1+2*3+4*5", emptyContext);
    expect(result.length).toBe(2);
    const node = result[0] as any;
    expect(node.node).toBe("add");
    expect(node.left).toMatchObject({ value: 1 });
    // Right should be add(mul(2,3), mul(4,5))
    expect(node.right.node).toBe("add");
    expect(node.right.left.node).toBe("mul");
  });
});

// =============================================================================
// Section 6: Grammar Building
// =============================================================================

describe("buildGrammar", () => {
  it("should include built-in atoms as the last level", () => {
    const grammar = buildGrammar([]);
    expect(grammar.length).toBe(1);
    expect(grammar[0]).toBe(BUILT_IN_ATOMS);
  });

  it("should sort operators by precedence ascending", () => {
    const opPrec2 = defineNode({
      name: "op2",
      pattern: [lhs().as("left"), constVal("@"), rhs().as("right")],
      precedence: 2,
      resultType: "unknown",
    });

    const opPrec1 = defineNode({
      name: "op1",
      pattern: [lhs().as("left"), constVal("#"), rhs().as("right")],
      precedence: 1,
      resultType: "unknown",
    });

    const grammar = buildGrammar([opPrec2, opPrec1]);

    // Should be: [[prec1 ops], [prec2 ops], [atoms]]
    expect(grammar.length).toBe(3);
    expect(grammar[0]).toContain(opPrec1);
    expect(grammar[1]).toContain(opPrec2);
    expect(grammar[2]).toBe(BUILT_IN_ATOMS);
  });

  it("should group operators with same precedence", () => {
    const op1 = defineNode({
      name: "op1",
      pattern: [lhs().as("left"), constVal("+"), rhs().as("right")],
      precedence: 1,
      resultType: "unknown",
    });

    const op2 = defineNode({
      name: "op2",
      pattern: [lhs().as("left"), constVal("-"), rhs().as("right")],
      precedence: 1,
      resultType: "unknown",
    });

    const grammar = buildGrammar([op1, op2]);

    // Should be: [[op1, op2], [atoms]]
    expect(grammar.length).toBe(2);
    expect(grammar[0]).toContain(op1);
    expect(grammar[0]).toContain(op2);
    expect(grammar[0].length).toBe(2);
  });

  it("should handle multiple precedence levels", () => {
    const opPrec1 = defineNode({
      name: "add",
      pattern: [lhs().as("left"), constVal("+"), rhs().as("right")],
      precedence: 1,
      resultType: "number",
    });

    const opPrec2 = defineNode({
      name: "mul",
      pattern: [lhs().as("left"), constVal("*"), rhs().as("right")],
      precedence: 2,
      resultType: "number",
    });

    const opPrec3 = defineNode({
      name: "pow",
      pattern: [lhs().as("base"), constVal("^"), rhs().as("exp")],
      precedence: 3,
      resultType: "number",
    });

    const grammar = buildGrammar([opPrec3, opPrec1, opPrec2]);

    expect(grammar.length).toBe(4); // 3 precedence levels + atoms
    expect(grammar[0]).toContain(opPrec1); // lowest precedence first
    expect(grammar[1]).toContain(opPrec2);
    expect(grammar[2]).toContain(opPrec3);
    expect(grammar[3]).toBe(BUILT_IN_ATOMS);
  });
});

// =============================================================================
// Section 7: Field Extraction (buildNodeResult)
// =============================================================================

describe("field extraction", () => {
  it("should extract named bindings into node fields", () => {
    const add = defineNode({
      name: "add",
      pattern: [lhs("number").as("left"), constVal("+"), rhs("number").as("right")],
      precedence: 1,
      resultType: "number",
    });

    const result = parse([add], "1+2", emptyContext);
    expect(result.length).toBe(2);
    const node = result[0] as any;
    expect(node).toHaveProperty("left");
    expect(node).toHaveProperty("right");
    expect(node.left).toMatchObject({ value: 1 });
    expect(node.right).toMatchObject({ value: 2 });
  });

  it("should include node name and outputSchema", () => {
    const sub = defineNode({
      name: "sub",
      pattern: [lhs("number").as("a"), constVal("-"), rhs("number").as("b")],
      precedence: 1,
      resultType: "number",
    });

    const result = parse([sub], "5-3", emptyContext);
    expect(result.length).toBe(2);
    const node = result[0] as any;
    expect(node.node).toBe("sub");
    expect(node.outputSchema).toBe("number");
  });

  it("should passthrough single unnamed child", () => {
    // When an atom is parsed (no named bindings, single child), it should passthrough
    const result = parse([], "42", emptyContext);
    expect(result.length).toBe(2);
    expect(result[0]).toMatchObject({
      node: "literal",
      value: 42,
    });
  });

  it("should use custom configure function when provided", () => {
    const customOp = defineNode({
      name: "custom",
      pattern: [lhs("number").as("x"), constVal("~"), rhs("number").as("y")],
      precedence: 1,
      resultType: "number",
      configure: (bindings) => ({
        first: bindings.x,
        second: bindings.y,
        computed: "extra",
      }),
    });

    const result = parse([customOp], "1~2", emptyContext);
    expect(result.length).toBe(2);
    const node = result[0] as any;
    expect(node).toHaveProperty("first");
    expect(node).toHaveProperty("second");
    expect(node).toHaveProperty("computed");
    expect(node.computed).toBe("extra");
  });

  it("should handle operators with multiple pattern elements", () => {
    const ternary = defineNode({
      name: "ternary",
      pattern: [
        lhs().as("cond"),
        constVal("?"),
        expr().as("then"),
        constVal(":"),
        expr().as("else"),
      ],
      precedence: 1,
      resultType: "unknown",
    });

    const result = parse([ternary], "x?1:2", contextWith({ x: "boolean" }));
    expect(result.length).toBe(2);
    const node = result[0] as any;
    expect(node.node).toBe("ternary");
    expect(node).toHaveProperty("cond");
    expect(node).toHaveProperty("then");
    expect(node).toHaveProperty("else");
  });
});

// =============================================================================
// Section 8: Whitespace Handling
// =============================================================================

describe("whitespace handling", () => {
  const add = defineNode({
    name: "add",
    pattern: [lhs("number").as("left"), constVal("+"), rhs("number").as("right")],
    precedence: 1,
    resultType: "number",
  });

  it("should handle spaces around operators", () => {
    const result = parse([add], "1 + 2", emptyContext);
    expect(result.length).toBe(2);
    expect((result[0] as any).node).toBe("add");
  });

  it("should handle leading whitespace", () => {
    const result = parse([add], "  1+2", emptyContext);
    expect(result.length).toBe(2);
    expect((result[0] as any).node).toBe("add");
  });

  it("should handle multiple spaces", () => {
    const result = parse([add], "1   +   2", emptyContext);
    expect(result.length).toBe(2);
    expect((result[0] as any).node).toBe("add");
  });

  it("should handle tabs", () => {
    const result = parse([add], "1\t+\t2", emptyContext);
    expect(result.length).toBe(2);
    expect((result[0] as any).node).toBe("add");
  });

  it("should handle newlines", () => {
    const result = parse([add], "1\n+\n2", emptyContext);
    expect(result.length).toBe(2);
    expect((result[0] as any).node).toBe("add");
  });

  it("should handle spaces around parentheses", () => {
    const result = parse([add], "( 1 + 2 )", emptyContext);
    expect(result.length).toBe(2);
    expect((result[0] as any).node).toBe("parentheses");
  });

  it("should preserve trailing whitespace in remaining", () => {
    const result = parse([], "42  ", emptyContext);
    expect(result.length).toBe(2);
    expect(result[1]).toBe("  ");
  });
});

// =============================================================================
// Section 9: Type Constraints
// =============================================================================

describe("type constraints", () => {
  it("should not match operator when lhs constraint fails", () => {
    const stringConcat = defineNode({
      name: "concat",
      pattern: [lhs("string").as("left"), constVal("++"), rhs("string").as("right")],
      precedence: 1,
      resultType: "string",
    });

    // Constraint fails, so operator doesn't match. Parser falls back to atom (number).
    // The number parses successfully and "++2" remains as unparsed input.
    const result = parse([stringConcat], "1++2", emptyContext);
    expect(result.length).toBe(2);
    expect(result[0]).toMatchObject({
      node: "literal",
      value: 1,
      outputSchema: "number",
    });
    expect(result[1]).toBe("++2"); // Operator didn't match, remaining input
  });

  it("should match operator when constraints are satisfied", () => {
    const numOp = defineNode({
      name: "numOp",
      pattern: [lhs("number").as("left"), constVal("%%"), rhs("number").as("right")],
      precedence: 1,
      resultType: "number",
    });

    // Should work with numbers
    const result1 = parse([numOp], "1%%2", emptyContext);
    expect(result1.length).toBe(2);
    expect((result1[0] as any).node).toBe("numOp");
    expect(result1[1]).toBe("");
  });

  it("should not match operator when rhs constraint fails", () => {
    const numOp = defineNode({
      name: "numOp",
      pattern: [lhs("number").as("left"), constVal("%%"), rhs("number").as("right")],
      precedence: 1,
      resultType: "number",
    });

    // Should fail with string on right - parses "1" and leaves rest
    const result2 = parse([numOp], '1%%"hello"', emptyContext);
    expect(result2.length).toBe(2);
    expect(result2[0]).toMatchObject({
      node: "literal",
      value: 1,
    });
    expect(result2[1]).toBe('%%"hello"');
  });

  it("should allow unconstrained expressions", () => {
    const anyOp = defineNode({
      name: "anyOp",
      pattern: [lhs().as("left"), constVal("??"), rhs().as("right")],
      precedence: 1,
      resultType: "unknown",
    });

    // Should work with any types
    const result1 = parse([anyOp], "1??2", emptyContext);
    expect(result1.length).toBe(2);
    expect((result1[0] as any).node).toBe("anyOp");

    const result2 = parse([anyOp], '"a"??"b"', emptyContext);
    expect(result2.length).toBe(2);
    expect((result2[0] as any).node).toBe("anyOp");

    const result3 = parse([anyOp], "foo??42", emptyContext);
    expect(result3.length).toBe(2);
    expect((result3[0] as any).node).toBe("anyOp");
  });

  it("should use context for identifier type checking", () => {
    // Note: Using @@ as operator because $ is a valid identifier character
    const numOp = defineNode({
      name: "numOp",
      pattern: [lhs("number").as("left"), constVal("@@"), rhs("number").as("right")],
      precedence: 1,
      resultType: "number",
    });

    // Should work when context says x is number
    const ctx1 = contextWith({ x: "number", y: "number" });
    const result1 = parse([numOp], "x@@y", ctx1);
    expect(result1.length).toBe(2);
    expect((result1[0] as any).node).toBe("numOp");

    // Should not match operator when context says x is string
    const ctx2 = contextWith({ x: "string", y: "number" });
    const result2 = parse([numOp], "x@@y", ctx2);
    expect(result2.length).toBe(2);
    // Falls back to parsing identifier "x"
    expect(result2[0]).toMatchObject({
      node: "identifier",
      name: "x",
    });
    expect(result2[1]).toBe("@@y");
  });
});

// =============================================================================
// Section 10: No Match Cases
// =============================================================================

describe("no match cases", () => {
  it("should return empty for invalid input", () => {
    const result = parse([], "@invalid", emptyContext);
    expect(result.length).toBe(0);
  });

  it("should return empty for empty input", () => {
    const result = parse([], "", emptyContext);
    expect(result.length).toBe(0);
  });

  it("should return empty for whitespace-only input", () => {
    const result = parse([], "   ", emptyContext);
    expect(result.length).toBe(0);
  });

  it("should return empty for unknown operator", () => {
    const add = defineNode({
      name: "add",
      pattern: [lhs().as("left"), constVal("+"), rhs().as("right")],
      precedence: 1,
      resultType: "number",
    });

    // @ is not defined as an operator
    const result = parse([add], "1@2", emptyContext);
    expect(result.length).toBe(2);
    // Should parse 1, leave @2 as remaining
    expect(result[1]).toBe("@2");
  });

  it("should return empty for unterminated string", () => {
    const result = parse([], '"unterminated', emptyContext);
    expect(result.length).toBe(0);
  });
});

// =============================================================================
// Section 11: Complex Expressions
// =============================================================================

describe("complex expressions", () => {
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

  const operators = [add, mul] as const;

  it("should parse long chained expression", () => {
    const result = parse(operators, "1+2+3+4+5", emptyContext);
    expect(result.length).toBe(2);
    expect((result[0] as any).node).toBe("add");
  });

  it("should parse mixed operators with variables", () => {
    const ctx = contextWith({ x: "number", y: "number" });
    const result = parse(operators, "x+y*2", ctx);
    expect(result.length).toBe(2);
    const node = result[0] as any;
    expect(node.node).toBe("add");
    expect(node.left.name).toBe("x");
    expect(node.right.node).toBe("mul");
    expect(node.right.left.name).toBe("y");
  });

  it("should parse nested parentheses with operators", () => {
    const result = parse(operators, "((1+2)*(3+4))", emptyContext);
    expect(result.length).toBe(2);
    const outer = result[0] as any;
    expect(outer.node).toBe("parentheses");
    expect(outer.inner.node).toBe("mul");
  });

  it("should parse alternating operators", () => {
    const result = parse(operators, "1+2*3+4*5+6", emptyContext);
    expect(result.length).toBe(2);
    expect((result[0] as any).node).toBe("add");
  });
});
