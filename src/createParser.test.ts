/**
 * Tests for createParser API
 *
 * Verifies that:
 * 1. Type-level parsing produces correct types (compile-time tests)
 * 2. Runtime parsing produces correct values (runtime tests)
 */

import assert from "node:assert";
import {
  defineNode,
  number,
  lhs,
  rhs,
  expr,
  constVal,
  createParser,
  ident,
} from "./index.js";
import type { Parse, ComputeGrammar, Context } from "./index.js";
import type { NumberNode } from "./primitive/index.js";

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
// Type Assertion Helpers
// =============================================================================

type AssertEqual<T, Expected> = T extends Expected
  ? Expected extends T
    ? true
    : false
  : false;

// =============================================================================
// Grammar Definition
// =============================================================================

const identifier = defineNode({
  name: "ident",
  pattern: [ident()],
  precedence: "atom",
  resultType: "unknown",
});

const numberLit = defineNode({
  name: "number",
  pattern: [number()],
  precedence: "atom",
  resultType: "number",
});

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

// Parentheses use expr() - full grammar reset for delimited context
const parens = defineNode({
  name: "parens",
  pattern: [constVal("("), expr("number").as("inner"), constVal(")")],
  precedence: "atom",
  resultType: "number",
});

const nodes = [numberLit, identifier, add, mul, parens] as const;

// =============================================================================
// Create Parser
// =============================================================================

const parser = createParser(nodes);

// =============================================================================
// Type-Level Tests (compile-time)
// =============================================================================

type Grammar = ComputeGrammar<typeof nodes>;
type Ctx = Context<{}>;

// Test T1: Parse simple number
type R1 = Parse<Grammar, "42", Ctx>;
type T1 = AssertEqual<R1, [NumberNode<"42">, ""]>;
const _t1: T1 = true;

// Test T2: Parse simple addition
type R2 = Parse<Grammar, "1+2", Ctx>;
type T2 = AssertEqual<R2, [AddNode<NumberNode<"1">, NumberNode<"2">>, ""]>;
const _t2: T2 = true;

// Test T3: Parse with precedence (mul binds tighter)
type R3 = Parse<Grammar, "1+2*3", Ctx>;
type ExpectedR3 = [
  AddNode<NumberNode<"1">, MulNode<NumberNode<"2">, NumberNode<"3">>>,
  ""
];
type T3 = AssertEqual<R3, ExpectedR3>;
const _t3: T3 = true;

// Test T4: No match
type R4 = Parse<Grammar, "@invalid", Ctx>;
type T4 = AssertEqual<R4, []>;
const _t4: T4 = true;

// =============================================================================
// Runtime Tests
// =============================================================================

console.log("=== createParser Runtime Tests ===");

// Test R1: Parse simple number
{
  const result = parser.parse("42", {});
  assert.ok(result.length === 2, "Should match");
  assert.strictEqual((result[0] as { node: string }).node, "literal");
  assert.strictEqual((result[0] as { raw: string }).raw, "42");
  assert.strictEqual(result[1], "");
  console.log("  R1: Parse '42' → OK");
}

// Test R2: Parse simple addition
{
  const result = parser.parse("1+2", {});
  assert.ok(result.length === 2, "Should match");
  const node = result[0] as unknown as { node: string };
  assert.strictEqual(node.node, "add"); // node property now contains the node name
  assert.strictEqual(result[1], "");
  console.log("  R2: Parse '1+2' → OK");
}

// Test R3: Parse with precedence
{
  const result = parser.parse("1+2*x", { x: "number" });
  //
  assert.ok(result.length === 2, "Should match");
  const node = result[0] as unknown as {
    node: string;
    left: unknown;
    right: unknown;
  };
  assert.strictEqual(node.node, "add");
  // Right should be mul(2, 3)
  const right = node.right as { node: string };
  assert.strictEqual(right.node, "mul");
  console.log("  R3: Parse '1+2*3' → OK (correct precedence)");
}

// Test R4: Parse with remaining input
{
  // @ts-expect-error - ValidatedInput requires full parsing, but we intentionally test partial parsing here
  const result = parser.parse("42 rest", {});
  assert.ok(result.length === 2, "Should match");
  assert.strictEqual(result[1], " rest");
  console.log("  R4: Parse '42 rest' → OK (remaining: ' rest')");
}

// Test R5: No match
{
  // @ts-expect-error
  const result = parser.parse("@invalid", {});
  assert.strictEqual(result.length, 0, "Should not match");
  console.log("  R5: Parse '@invalid' → OK (no match)");
}

// Test R6: Chained addition (right-associative)
{
  const result = parser.parse("1+2+x", { x: "number" });
  assert.ok(result.length === 2, "Should match");
  const node = result[0] as unknown as {
    node: string;
    left: unknown;
    right: unknown;
  };
  assert.strictEqual(node.node, "add");
  // Right should be add(2, 3) due to right-recursion
  const right = node.right as { node: string };
  assert.strictEqual(right.node, "add");
  console.log("  R6: Parse '1+2+3' → OK (right-associative)");
}

// Test R7: Precedence with mul on right (2+1*3 → add(2, mul(1,3)))
{
  const result = parser.parse("2+1*3", {});
  assert.ok(result.length === 2, "Should match");
  const node = result[0] as unknown as {
    node: string;
    left: unknown;
    right: unknown;
  };
  assert.strictEqual(node.node, "add");
  // Left should be 2
  const left = node.left as { node: string; raw: string };
  assert.strictEqual(left.node, "literal");
  assert.strictEqual(left.raw, "2");
  // Right should be mul(1, 3)
  const right = node.right as { node: string };
  assert.strictEqual(right.node, "mul");
  console.log("  R7: Parse '2+1*3' → OK (mul binds tighter)");
}

// Test R8: Parentheses (expr() resets to full grammar)
{
  const result = parser.parse("(1+2)*3", {});
  assert.ok(result.length === 2, "Should match");
  const node = result[0] as unknown as {
    node: string;
    left: unknown;
    right: unknown;
  };
  assert.strictEqual(node.node, "mul");
  // Left should be the parens node containing add(1, 2)
  const left = node.left as { node: string; inner: unknown };
  assert.strictEqual(left.node, "parens");
  console.log("  R8: Parse '(1+2)*3' → OK (parens reset precedence)");
}

// Test R9: Nested parens
{
  const result = parser.parse("((1+2))", {});
  assert.ok(result.length === 2, "Should match");
  const node = result[0] as unknown as { node: string };
  assert.strictEqual(node.node, "parens");
  console.log("  R9: Parse '((1+2))' → OK (nested parens)");
}

console.log("");
console.log("========================================");
console.log("All createParser tests passed!");
console.log("========================================");

export {};
