/**
 * Tests for createParser API
 *
 * Verifies that:
 * 1. Type-level parsing produces correct types (compile-time tests)
 * 2. Runtime parsing produces correct values (runtime tests)
 */

import { describe, it, expect } from "vitest";
import {
  defineNode,
  lhs,
  rhs,
  constVal,
  createParser,
} from "./index.js";
import type { Parse, ComputeGrammar, Context } from "./index.js";
import type { NumberNode } from "./primitive/index.js";
import { typeCheck, type AssertEqual } from "./test-helpers.js";

// AST node type with named bindings
interface AddNode<TLeft, TRight> {
  readonly node: "add";
  readonly outputSchema: "number";
  readonly left: TLeft;
  readonly right: TRight;
}

interface MulNode<TLeft, TRight> {
  readonly node: "mul";
  readonly outputSchema: "number";
  readonly left: TLeft;
  readonly right: TRight;
}

// =============================================================================
// Grammar Definition
// =============================================================================
// Only operators are defined - atoms (number, string, identifier, parentheses)
// are built-in and automatically included in the grammar.

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

// Only operators - atoms are built-in
const operators = [add, mul] as const;

// =============================================================================
// Create Parser
// =============================================================================

const parser = createParser(operators);

// =============================================================================
// Type-Level Tests (compile-time)
// =============================================================================

type Grammar = ComputeGrammar<typeof operators>;
type Ctx = Context<{}>;

describe("createParser type-level tests", () => {
  it("should parse simple number (compile-time)", () => {
    type R1 = Parse<Grammar, "42", Ctx>;
    type T1 = AssertEqual<R1, [NumberNode<"42">, ""]>;
    typeCheck<T1>(true);
  });

  it("should parse simple addition (compile-time)", () => {
    type R2 = Parse<Grammar, "1+2", Ctx>;
    type T2 = AssertEqual<R2, [AddNode<NumberNode<"1">, NumberNode<"2">>, ""]>;
    typeCheck<T2>(true);
  });

  it("should parse with precedence - mul binds tighter (compile-time)", () => {
    type R3 = Parse<Grammar, "1+2*3", Ctx>;
    type ExpectedR3 = [
      AddNode<NumberNode<"1">, MulNode<NumberNode<"2">, NumberNode<"3">>>,
      ""
    ];
    type T3 = AssertEqual<R3, ExpectedR3>;
    typeCheck<T3>(true);
  });

  it("should return empty tuple for no match (compile-time)", () => {
    type R4 = Parse<Grammar, "@invalid", Ctx>;
    type T4 = AssertEqual<R4, []>;
    typeCheck<T4>(true);
  });
});

// =============================================================================
// Runtime Tests
// =============================================================================

describe("createParser runtime tests", () => {
  it("should parse simple number", () => {
    const result = parser.parse("42", {});
    expect(result.length).toBe(2);
    expect((result[0] as { node: string }).node).toBe("literal");
    expect((result[0] as { raw: string }).raw).toBe("42");
    expect(result[1]).toBe("");
  });

  it("should parse simple addition", () => {
    const result = parser.parse("1+2", {});
    expect(result.length).toBe(2);
    const node = result[0] as unknown as { node: string };
    expect(node.node).toBe("add");
    expect(result[1]).toBe("");
  });

  it("should parse with precedence", () => {
    const result = parser.parse("1+2*x", { x: "number" });
    expect(result.length).toBe(2);
    const node = result[0] as unknown as {
      node: string;
      left: unknown;
      right: unknown;
    };
    expect(node.node).toBe("add");
    // Right should be mul(2, x)
    const right = node.right as { node: string };
    expect(right.node).toBe("mul");
  });

  it("should return remaining input", () => {
    // @ts-expect-error - ValidatedInput requires full parsing, but we intentionally test partial parsing here
    const result = parser.parse("42 rest", {});
    expect(result.length).toBe(2);
    expect(result[1]).toBe(" rest");
  });

  it("should return empty array for no match", () => {
    // @ts-expect-error
    const result = parser.parse("@invalid", {});
    expect(result.length).toBe(0);
  });

  it("should handle chained addition (right-associative)", () => {
    const result = parser.parse("1+2+x", { x: "number" });
    expect(result.length).toBe(2);
    const node = result[0] as unknown as {
      node: string;
      left: unknown;
      right: unknown;
    };
    expect(node.node).toBe("add");
    // Right should be add(2, x) due to right-recursion
    const right = node.right as { node: string };
    expect(right.node).toBe("add");
  });

  it("should handle precedence with mul on right (2+1*3 → add(2, mul(1,3)))", () => {
    const result = parser.parse("2+1*3", {});
    expect(result.length).toBe(2);
    const node = result[0] as unknown as {
      node: string;
      left: unknown;
      right: unknown;
    };
    expect(node.node).toBe("add");
    // Left should be 2
    const left = node.left as { node: string; raw: string };
    expect(left.node).toBe("literal");
    expect(left.raw).toBe("2");
    // Right should be mul(1, 3)
    const right = node.right as { node: string };
    expect(right.node).toBe("mul");
  });

  it("should handle parentheses (expr() resets to full grammar)", () => {
    const result = parser.parse("(1+2)*3", {});
    expect(result.length).toBe(2);
    const node = result[0] as unknown as {
      node: string;
      left: unknown;
      right: unknown;
    };
    expect(node.node).toBe("mul");
    // Left should be the built-in parentheses node containing add(1, 2)
    const left = node.left as { node: string; inner: unknown };
    expect(left.node).toBe("parentheses");
  });

  it("should handle nested parentheses", () => {
    const result = parser.parse("((1+2))", {});
    expect(result.length).toBe(2);
    const node = result[0] as unknown as { node: string };
    expect(node.node).toBe("parentheses");
  });
});
