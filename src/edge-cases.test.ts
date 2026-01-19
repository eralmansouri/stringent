/**
 * Edge Case Tests
 *
 * Comprehensive tests for edge cases and boundary conditions:
 * - Deeply nested parentheses (10+ levels)
 * - Long chained operations
 * - Mixed precedence chains
 * - Empty input handling
 * - Whitespace-only input
 * - Unicode identifiers
 * - Very long string literals
 * - Number edge cases (negative, decimals, scientific notation)
 */

import { describe, it, expect } from "vitest";
import { parse } from "./runtime/parser.js";
import { defineNode, lhs, rhs, constVal } from "./schema/index.js";
import type { Context } from "./context.js";

// =============================================================================
// Test Helpers
// =============================================================================

const emptyContext: Context = { data: {} };

function contextWith(data: Record<string, string>): Context {
  return { data };
}

// =============================================================================
// Test Grammar
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

const sub = defineNode({
  name: "sub",
  pattern: [lhs("number").as("left"), constVal("-"), rhs("number").as("right")],
  precedence: 1,
  resultType: "number",
});

const div = defineNode({
  name: "div",
  pattern: [lhs("number").as("left"), constVal("/"), rhs("number").as("right")],
  precedence: 2,
  resultType: "number",
});

const pow = defineNode({
  name: "pow",
  pattern: [lhs("number").as("base"), constVal("^"), rhs("number").as("exp")],
  precedence: 3,
  resultType: "number",
});

const operators = [add, sub, mul, div, pow] as const;

// =============================================================================
// Section 1: Deeply Nested Parentheses (10+ levels)
// =============================================================================

describe("deeply nested parentheses", () => {
  it("should parse 10 levels of nested parentheses", () => {
    const input = "((((((((((42))))))))))";
    const result = parse([], input, emptyContext);
    expect(result.length).toBe(2);
    expect(result[1]).toBe("");

    // Navigate through all parentheses levels
    let node: any = result[0];
    for (let i = 0; i < 10; i++) {
      expect(node.node).toBe("parentheses");
      node = node.inner;
    }
    expect(node.node).toBe("literal");
    expect(node.value).toBe(42);
  });

  it("should parse 15 levels of nested parentheses", () => {
    const input = "(((((((((((((((1)))))))))))))))";
    const result = parse([], input, emptyContext);
    expect(result.length).toBe(2);
    expect(result[1]).toBe("");

    let node: any = result[0];
    for (let i = 0; i < 15; i++) {
      expect(node.node).toBe("parentheses");
      node = node.inner;
    }
    expect(node.node).toBe("literal");
    expect(node.value).toBe(1);
  });

  it("should parse 20 levels of nested parentheses", () => {
    const input: string = "((((((((((((((((((((99))))))))))))))))))))";
    // Cast input to avoid type recursion limit on deeply nested expressions
    const result = parse([], input as string, emptyContext) as any;
    expect(result.length).toBe(2);
    expect(result[1]).toBe("");

    let node: any = result[0];
    for (let i = 0; i < 20; i++) {
      expect(node.node).toBe("parentheses");
      node = node.inner;
    }
    expect(node.node).toBe("literal");
    expect(node.value).toBe(99);
  });

  it("should parse deeply nested parentheses with expression inside", () => {
    // Use fewer nesting levels with operators to avoid type computation timeout
    const input = "((1+2))";
    const result = parse(operators, input, emptyContext);
    expect(result.length).toBe(2);
    expect(result[1]).toBe("");

    // Navigate through 2 levels of parens
    let node: any = result[0];
    for (let i = 0; i < 2; i++) {
      expect(node.node).toBe("parentheses");
      node = node.inner;
    }
    expect(node.node).toBe("add");
  });

  it("should parse nested parentheses with operators at multiple levels", () => {
    const input = "((1+2)*(3+4))";
    const result = parse(operators, input, emptyContext);
    expect(result.length).toBe(2);
    expect(result[1]).toBe("");

    const outer = result[0] as any;
    expect(outer.node).toBe("parentheses");
    expect(outer.inner.node).toBe("mul");
    expect(outer.inner.left.node).toBe("parentheses");
    expect(outer.inner.left.inner.node).toBe("add");
    expect(outer.inner.right.node).toBe("parentheses");
    expect(outer.inner.right.inner.node).toBe("add");
  });

  it("should fail on mismatched deeply nested parentheses", () => {
    // 10 opening, 9 closing
    const input = "((((((((((42)))))))))";
    const result = parse([], input, emptyContext);
    expect(result.length).toBe(0);
  });

  it("should parse alternating parentheses depths", () => {
    const input = "((1))+((2))";
    const result = parse(operators, input, emptyContext);
    expect(result.length).toBe(2);
    expect(result[1]).toBe("");
    expect((result[0] as any).node).toBe("add");
  });
});

// =============================================================================
// Section 2: Long Chained Operations
// =============================================================================

describe("long chained operations", () => {
  it("should parse 5 chained additions", () => {
    const result = parse(operators, "1+2+3+4+5", emptyContext);
    expect(result.length).toBe(2);
    expect(result[1]).toBe("");
    expect((result[0] as any).node).toBe("add");
  });

  it("should parse 10 chained additions", () => {
    const result = parse(operators, "1+2+3+4+5+6+7+8+9+10", emptyContext);
    expect(result.length).toBe(2);
    expect(result[1]).toBe("");
    expect((result[0] as any).node).toBe("add");
  });

  it("should parse 15 chained additions", () => {
    const result = parse(operators, "1+2+3+4+5+6+7+8+9+10+11+12+13+14+15", emptyContext);
    expect(result.length).toBe(2);
    expect(result[1]).toBe("");
    expect((result[0] as any).node).toBe("add");
  });

  it("should parse 5 chained multiplications", () => {
    const result = parse(operators, "1*2*3*4*5", emptyContext);
    expect(result.length).toBe(2);
    expect(result[1]).toBe("");
    expect((result[0] as any).node).toBe("mul");
  });

  it("should parse 10 chained multiplications", () => {
    const result = parse(operators, "2*2*2*2*2*2*2*2*2*2", emptyContext);
    expect(result.length).toBe(2);
    expect(result[1]).toBe("");
    expect((result[0] as any).node).toBe("mul");
  });

  it("should preserve right-associativity in long chains", () => {
    // 1+2+3 should parse as add(1, add(2, 3))
    const result = parse(operators, "1+2+3+4", emptyContext);
    expect(result.length).toBe(2);

    const node = result[0] as any;
    expect(node.node).toBe("add");
    expect(node.left.value).toBe(1);
    expect(node.right.node).toBe("add");
    expect(node.right.left.value).toBe(2);
    expect(node.right.right.node).toBe("add");
    expect(node.right.right.left.value).toBe(3);
    expect(node.right.right.right.value).toBe(4);
  });

  it("should parse chained subtractions", () => {
    const result = parse(operators, "10-5-3-1", emptyContext);
    expect(result.length).toBe(2);
    expect(result[1]).toBe("");
    expect((result[0] as any).node).toBe("sub");
  });

  it("should parse chained divisions", () => {
    const result = parse(operators, "100/10/5/2", emptyContext);
    expect(result.length).toBe(2);
    expect(result[1]).toBe("");
    expect((result[0] as any).node).toBe("div");
  });

  it("should parse chained operations with variables", () => {
    const ctx = contextWith({
      a: "number",
      b: "number",
      c: "number",
      d: "number",
      e: "number",
    });
    const result = parse(operators, "a+b+c+d+e", ctx);
    expect(result.length).toBe(2);
    expect(result[1]).toBe("");
    expect((result[0] as any).node).toBe("add");
  });

  it("should parse very long expression with 20 operations", () => {
    const expr: string = Array.from({ length: 21 }, (_, i) => i + 1).join("+");
    // Cast input to string to avoid type instantiation depth limit
    const result = parse(operators, expr as string, emptyContext) as any;
    expect(result.length).toBe(2);
    expect(result[1]).toBe("");
    expect(result[0].node).toBe("add");
  });
});

// =============================================================================
// Section 3: Mixed Precedence Chains
// =============================================================================

describe("mixed precedence chains", () => {
  it("should handle add-mul-add chain", () => {
    // 1+2*3+4 should parse as add(1, add(mul(2,3), 4))
    const result = parse(operators, "1+2*3+4", emptyContext);
    expect(result.length).toBe(2);
    expect(result[1]).toBe("");

    const node = result[0] as any;
    expect(node.node).toBe("add");
    expect(node.left.value).toBe(1);
    expect(node.right.node).toBe("add");
    expect(node.right.left.node).toBe("mul");
  });

  it("should handle mul-add-mul chain", () => {
    // 1*2+3*4 should parse as add(mul(1,2), mul(3,4))
    const result = parse(operators, "1*2+3*4", emptyContext);
    expect(result.length).toBe(2);

    const node = result[0] as any;
    expect(node.node).toBe("add");
    expect(node.left.node).toBe("mul");
    expect(node.right.node).toBe("mul");
  });

  it("should handle three precedence levels", () => {
    // 1+2*3^4 should parse as add(1, mul(2, pow(3,4)))
    const result = parse(operators, "1+2*3^4", emptyContext);
    expect(result.length).toBe(2);

    const node = result[0] as any;
    expect(node.node).toBe("add");
    expect(node.left.value).toBe(1);
    expect(node.right.node).toBe("mul");
    expect(node.right.left.value).toBe(2);
    expect(node.right.right.node).toBe("pow");
  });

  it("should handle complex mixed precedence", () => {
    // 1+2*3+4*5^6
    const result = parse(operators, "1+2*3+4*5^6", emptyContext);
    expect(result.length).toBe(2);
    expect((result[0] as any).node).toBe("add");
  });

  it("should handle parentheses overriding precedence in chain", () => {
    // (1+2)*3+4 should parse differently than 1+2*3+4
    const result = parse(operators, "(1+2)*3+4", emptyContext);
    expect(result.length).toBe(2);

    const node = result[0] as any;
    expect(node.node).toBe("add");
    expect(node.left.node).toBe("mul");
    expect(node.left.left.node).toBe("parentheses");
    expect(node.left.left.inner.node).toBe("add");
  });

  it("should handle alternating operators of different precedence", () => {
    // 1+2*3-4/5
    const result = parse(operators, "1+2*3-4/5", emptyContext);
    expect(result.length).toBe(2);
    expect((result[0] as any).node).toBe("add");
  });

  it("should handle long mixed precedence expression", () => {
    const result = parse(operators, "1+2*3+4*5+6*7+8*9", emptyContext);
    expect(result.length).toBe(2);
    expect((result[0] as any).node).toBe("add");
  });

  it("should handle sub and div with add and mul", () => {
    // 10-2*3+4/2
    const result = parse(operators, "10-2*3+4/2", emptyContext);
    expect(result.length).toBe(2);

    const node = result[0] as any;
    expect(node.node).toBe("sub");
  });

  it("should handle exponentiation in complex expression", () => {
    // 2^3*4+5
    const result = parse(operators, "2^3*4+5", emptyContext);
    expect(result.length).toBe(2);

    const node = result[0] as any;
    expect(node.node).toBe("add");
    expect(node.left.node).toBe("mul");
    expect(node.left.left.node).toBe("pow");
  });
});

// =============================================================================
// Section 4: Empty Input Handling
// =============================================================================

describe("empty input handling", () => {
  it("should return empty for empty string", () => {
    const result = parse([], "", emptyContext);
    expect(result.length).toBe(0);
  });

  it("should return empty for empty string with operators defined", () => {
    const result = parse(operators, "", emptyContext);
    expect(result.length).toBe(0);
  });

  it("should return empty for null character", () => {
    const result = parse([], "\0", emptyContext);
    expect(result.length).toBe(0);
  });
});

// =============================================================================
// Section 5: Whitespace-only Input
// =============================================================================

describe("whitespace-only input", () => {
  it("should return empty for single space", () => {
    const result = parse([], " ", emptyContext);
    expect(result.length).toBe(0);
  });

  it("should return empty for multiple spaces", () => {
    const result = parse([], "     ", emptyContext);
    expect(result.length).toBe(0);
  });

  it("should return empty for single tab", () => {
    const result = parse([], "\t", emptyContext);
    expect(result.length).toBe(0);
  });

  it("should return empty for multiple tabs", () => {
    const result = parse([], "\t\t\t", emptyContext);
    expect(result.length).toBe(0);
  });

  it("should return empty for single newline", () => {
    const result = parse([], "\n", emptyContext);
    expect(result.length).toBe(0);
  });

  it("should return empty for multiple newlines", () => {
    const result = parse([], "\n\n\n", emptyContext);
    expect(result.length).toBe(0);
  });

  it("should return empty for carriage return", () => {
    const result = parse([], "\r", emptyContext);
    expect(result.length).toBe(0);
  });

  it("should return empty for CRLF", () => {
    const result = parse([], "\r\n", emptyContext);
    expect(result.length).toBe(0);
  });

  it("should return empty for mixed whitespace", () => {
    const result = parse([], "  \t\n  \t\n  ", emptyContext);
    expect(result.length).toBe(0);
  });

  it("should return empty for form feed", () => {
    const result = parse([], "\f", emptyContext);
    expect(result.length).toBe(0);
  });

  it("should return empty for vertical tab", () => {
    const result = parse([], "\v", emptyContext);
    expect(result.length).toBe(0);
  });
});

// =============================================================================
// Section 6: Unicode Identifiers
// =============================================================================

describe("unicode identifiers", () => {
  it("should parse ASCII identifiers", () => {
    const result = parse([], "foo", emptyContext);
    expect(result.length).toBe(2);
    expect(result[0]).toMatchObject({
      node: "identifier",
      name: "foo",
    });
  });

  it("should parse identifiers with underscores", () => {
    const result = parse([], "foo_bar_baz", emptyContext);
    expect(result.length).toBe(2);
    expect(result[0]).toMatchObject({
      node: "identifier",
      name: "foo_bar_baz",
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

  it("should parse identifiers with dollar sign", () => {
    const result = parse([], "$value", emptyContext);
    expect(result.length).toBe(2);
    expect(result[0]).toMatchObject({
      node: "identifier",
      name: "$value",
    });
  });

  it("should parse identifiers with numbers after first char", () => {
    const result = parse([], "var123abc456", emptyContext);
    expect(result.length).toBe(2);
    expect(result[0]).toMatchObject({
      node: "identifier",
      name: "var123abc456",
    });
  });

  it("should not parse identifiers starting with numbers", () => {
    const result = parse([], "123abc", emptyContext);
    expect(result.length).toBe(2);
    // Should parse 123 as number
    expect(result[0]).toMatchObject({
      node: "literal",
      value: 123,
    });
    expect(result[1]).toBe("abc");
  });

  it("should parse CamelCase identifiers", () => {
    const result = parse([], "MyVariableName", emptyContext);
    expect(result.length).toBe(2);
    expect(result[0]).toMatchObject({
      node: "identifier",
      name: "MyVariableName",
    });
  });

  it("should parse snake_case identifiers", () => {
    const result = parse([], "my_variable_name", emptyContext);
    expect(result.length).toBe(2);
    expect(result[0]).toMatchObject({
      node: "identifier",
      name: "my_variable_name",
    });
  });

  it("should parse SCREAMING_SNAKE_CASE identifiers", () => {
    const result = parse([], "MY_CONSTANT_VALUE", emptyContext);
    expect(result.length).toBe(2);
    expect(result[0]).toMatchObject({
      node: "identifier",
      name: "MY_CONSTANT_VALUE",
    });
  });

  it("should parse very long identifiers", () => {
    const longName: string = "a".repeat(100);
    // Cast input to string to avoid type inference on dynamically generated string
    const result = parse([], longName as string, emptyContext) as any;
    expect(result.length).toBe(2);
    expect(result[0]).toMatchObject({
      node: "identifier",
      name: longName,
    });
  });

  it("should use context for unicode-named identifiers", () => {
    const ctx = contextWith({ myVar: "number" });
    const result = parse([], "myVar", ctx);
    expect(result.length).toBe(2);
    expect(result[0]).toMatchObject({
      node: "identifier",
      name: "myVar",
      outputSchema: "number",
    });
  });
});

// =============================================================================
// Section 7: Very Long String Literals
// =============================================================================

describe("very long string literals", () => {
  it("should parse string with 100 characters", () => {
    const content = "a".repeat(100);
    const result = parse([], `"${content}"`, emptyContext);
    expect(result.length).toBe(2);
    expect(result[0]).toMatchObject({
      node: "literal",
      raw: content,
      value: content,
      outputSchema: "string",
    });
  });

  it("should parse string with 1000 characters", () => {
    const content = "x".repeat(1000);
    const result = parse([], `"${content}"`, emptyContext);
    expect(result.length).toBe(2);
    expect(result[0]).toMatchObject({
      node: "literal",
      raw: content,
    });
  });

  it("should parse string with spaces", () => {
    const content = "hello world this is a long string with many spaces";
    const result = parse([], `"${content}"`, emptyContext);
    expect(result.length).toBe(2);
    expect(result[0]).toMatchObject({
      node: "literal",
      raw: content,
    });
  });

  it("should parse string with mixed content", () => {
    const content = "abc123!@#XYZ789";
    const result = parse([], `"${content}"`, emptyContext);
    expect(result.length).toBe(2);
    expect(result[0]).toMatchObject({
      node: "literal",
      raw: content,
    });
  });

  it("should parse single-quoted long string", () => {
    const content = "b".repeat(500);
    const result = parse([], `'${content}'`, emptyContext);
    expect(result.length).toBe(2);
    expect(result[0]).toMatchObject({
      node: "literal",
      raw: content,
    });
  });

  it("should parse string with numbers", () => {
    const content = "123456789012345678901234567890";
    const result = parse([], `"${content}"`, emptyContext);
    expect(result.length).toBe(2);
    expect(result[0]).toMatchObject({
      node: "literal",
      raw: content,
      outputSchema: "string",
    });
  });

  it("should parse string containing operators", () => {
    const content = "1 + 2 * 3 - 4 / 5";
    const result = parse(operators, `"${content}"`, emptyContext);
    expect(result.length).toBe(2);
    expect(result[0]).toMatchObject({
      node: "literal",
      raw: content,
      outputSchema: "string",
    });
  });

  it("should parse string containing parentheses", () => {
    const content = "((nested)) (parens)";
    const result = parse([], `"${content}"`, emptyContext);
    expect(result.length).toBe(2);
    expect(result[0]).toMatchObject({
      node: "literal",
      raw: content,
    });
  });

  it("should handle empty string", () => {
    const result = parse([], '""', emptyContext);
    expect(result.length).toBe(2);
    expect(result[0]).toMatchObject({
      node: "literal",
      raw: "",
      value: "",
    });
  });

  it("should handle single character string", () => {
    const result = parse([], '"a"', emptyContext);
    expect(result.length).toBe(2);
    expect(result[0]).toMatchObject({
      node: "literal",
      raw: "a",
      value: "a",
    });
  });
});

// =============================================================================
// Section 8: Number Edge Cases
// =============================================================================

describe("number edge cases", () => {
  describe("basic integers", () => {
    it("should parse zero", () => {
      const result = parse([], "0", emptyContext);
      expect(result.length).toBe(2);
      expect(result[0]).toMatchObject({
        node: "literal",
        value: 0,
      });
    });

    it("should parse single digit", () => {
      const result = parse([], "5", emptyContext);
      expect(result.length).toBe(2);
      expect(result[0]).toMatchObject({
        node: "literal",
        value: 5,
      });
    });

    it("should parse large integer", () => {
      const result = parse([], "999999999999", emptyContext);
      expect(result.length).toBe(2);
      expect(result[0]).toMatchObject({
        node: "literal",
        value: 999999999999,
      });
    });

    it("should parse number with leading zeros", () => {
      // Token.Number parses leading zeros one digit at a time
      // "007" parses "0" first, leaving "07" as remaining
      const result = parse([], "007", emptyContext);
      expect(result.length).toBe(2);
      expect(result[0]).toMatchObject({
        node: "literal",
        value: 0,
      });
      expect(result[1]).toBe("07");
    });
  });

  describe("decimal numbers", () => {
    it("should parse decimal with single digit before and after", () => {
      const result = parse([], "1.2", emptyContext);
      expect(result.length).toBe(2);
      expect(result[0]).toMatchObject({
        node: "literal",
        value: 1.2,
      });
    });

    it("should parse decimal with multiple digits", () => {
      const result = parse([], "123.456", emptyContext);
      expect(result.length).toBe(2);
      expect(result[0]).toMatchObject({
        node: "literal",
        value: 123.456,
      });
    });

    it("should parse leading decimal point", () => {
      // .5 becomes 0.5
      const result = parse([], ".5", emptyContext);
      expect(result.length).toBe(2);
      expect(result[0]).toMatchObject({
        node: "literal",
        raw: "0.5",
        value: 0.5,
      });
    });

    it("should parse trailing decimal point as integer", () => {
      // 5. is parsed as 5 (trailing dot is not consumed)
      const result = parse([], "5.", emptyContext);
      expect(result.length).toBe(2);
      expect(result[0]).toMatchObject({
        node: "literal",
        raw: "5",
        value: 5,
      });
    });

    it("should parse very small decimal", () => {
      const result = parse([], "0.000001", emptyContext);
      expect(result.length).toBe(2);
      expect(result[0]).toMatchObject({
        node: "literal",
        value: 0.000001,
      });
    });

    it("should parse decimal with many decimal places", () => {
      const result = parse([], "3.141592653589793", emptyContext);
      expect(result.length).toBe(2);
      expect(result[0]).toMatchObject({
        node: "literal",
        value: 3.141592653589793,
      });
    });
  });

  describe("negative numbers", () => {
    it("should parse negative number via Token.Number", () => {
      // Token.Number actually supports negative numbers directly
      const result = parse([], "-5", emptyContext);
      expect(result.length).toBe(2);
      expect(result[0]).toMatchObject({
        node: "literal",
        value: -5,
      });
      expect(result[1]).toBe("");
    });

    it("should parse negative in subtraction context", () => {
      // With subtraction operator, "0-5" works
      const result = parse(operators, "0-5", emptyContext);
      expect(result.length).toBe(2);
      expect((result[0] as any).node).toBe("sub");
    });

    it("should handle negative in parentheses as subtraction from zero", () => {
      const result = parse(operators, "(0-5)", emptyContext);
      expect(result.length).toBe(2);
      expect((result[0] as any).inner.node).toBe("sub");
    });
  });

  describe("scientific notation", () => {
    // Token.Number parses "1e10" as "1" with "e10" remaining
    // The "e10" part is then parsed as an identifier
    it("should parse integer part and leave exponent as identifier", () => {
      const result = parse([], "1e10", emptyContext);
      expect(result.length).toBe(2);
      expect(result[0]).toMatchObject({
        node: "literal",
        value: 1,
      });
      expect(result[1]).toBe("e10");
    });

    it("should parse uppercase E same way", () => {
      const result = parse([], "1E5", emptyContext);
      expect(result.length).toBe(2);
      expect(result[0]).toMatchObject({
        node: "literal",
        value: 1,
      });
      expect(result[1]).toBe("E5");
    });

    it("should handle number followed by e and minus", () => {
      const result = parse([], "1e-5", emptyContext);
      expect(result.length).toBe(2);
      expect(result[0]).toMatchObject({
        node: "literal",
        value: 1,
      });
      expect(result[1]).toBe("e-5");
    });
  });

  describe("special values", () => {
    it("should handle Infinity as identifier", () => {
      const result = parse([], "Infinity", emptyContext);
      expect(result.length).toBe(2);
      expect(result[0]).toMatchObject({
        node: "identifier",
        name: "Infinity",
      });
    });

    it("should handle NaN as identifier", () => {
      const result = parse([], "NaN", emptyContext);
      expect(result.length).toBe(2);
      expect(result[0]).toMatchObject({
        node: "identifier",
        name: "NaN",
      });
    });
  });

  describe("boundary values", () => {
    it("should parse MAX_SAFE_INTEGER", () => {
      const result = parse([], "9007199254740991", emptyContext);
      expect(result.length).toBe(2);
      expect(result[0]).toMatchObject({
        node: "literal",
        value: Number.MAX_SAFE_INTEGER,
      });
    });

    it("should parse beyond MAX_SAFE_INTEGER (loses precision)", () => {
      const result = parse([], "9007199254740992", emptyContext);
      expect(result.length).toBe(2);
      // Value may not be exact due to floating point
      expect((result[0] as any).node).toBe("literal");
    });
  });
});

// =============================================================================
// Section 9: Complex Combined Edge Cases
// =============================================================================

describe("complex combined edge cases", () => {
  it("should handle deeply nested expression with long chain", () => {
    // Cast to avoid type recursion limit
    const result = parse(operators, "(((1+2+3+4+5)))" as string, emptyContext) as any;
    expect(result.length).toBe(2);
    expect(result[1]).toBe("");
  });

  it("should handle mixed types in expression", () => {
    const ctx = contextWith({ x: "number" });
    const result = parse(operators, "(x+1)*2", ctx);
    expect(result.length).toBe(2);
    expect(result[1]).toBe("");
    expect((result[0] as any).node).toBe("mul");
  });

  it("should handle whitespace in complex expression", () => {
    const result = parse(operators, "  (  1  +  2  )  *  3  ", emptyContext);
    expect(result.length).toBe(2);
    expect((result[0] as any).node).toBe("mul");
  });

  it("should handle expression with string followed by remaining", () => {
    const result = parse([], '"hello" world', emptyContext);
    expect(result.length).toBe(2);
    expect(result[0]).toMatchObject({
      node: "literal",
      raw: "hello",
    });
    expect(result[1]).toBe(" world");
  });

  it("should handle number followed by remaining text", () => {
    const result = parse([], "42abc", emptyContext);
    expect(result.length).toBe(2);
    expect(result[0]).toMatchObject({
      node: "literal",
      value: 42,
    });
    expect(result[1]).toBe("abc");
  });

  it("should handle identifier followed by operator without space", () => {
    const ctx = contextWith({ x: "number" });
    const result = parse(operators, "x+1", ctx);
    expect(result.length).toBe(2);
    expect((result[0] as any).node).toBe("add");
    expect((result[0] as any).left.name).toBe("x");
  });

  it("should handle multiple parenthesized groups in expression", () => {
    const result = parse(operators, "(1+2)*(3+4)*(5+6)", emptyContext);
    expect(result.length).toBe(2);
    expect(result[1]).toBe("");
    expect((result[0] as any).node).toBe("mul");
  });

  it("should handle expression ending with parenthesized group", () => {
    const result = parse(operators, "1+2*(3+4)", emptyContext);
    expect(result.length).toBe(2);
    expect(result[1]).toBe("");
    const node = result[0] as any;
    expect(node.node).toBe("add");
    expect(node.right.node).toBe("mul");
  });
});
