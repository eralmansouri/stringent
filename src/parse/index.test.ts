/**
 * Tests for Parse<Grammar, Input, Context>
 *
 * Verifies that type-level parsing produces correct types.
 * These are compile-time tests - if this file compiles, the tests pass.
 */

import type { Context } from "../context.js";
import type { ComputeGrammar } from "../grammar/index.js";
import type { Parse } from "./index.js";
import type { NumberNode } from "../primitive/index.js";
import { defineNode, lhs, rhs, constVal } from "../schema/index.js";

// AST node types with named bindings
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
// Type Assertion Helper
// =============================================================================

type AssertEqual<T, Expected> = T extends Expected
  ? Expected extends T
    ? true
    : false
  : false;

// =============================================================================
// Test Grammar
// =============================================================================
// Only operators are defined - atoms are built-in

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

// Only operators - atoms are built-in and automatically appended
type Operators = readonly [typeof add, typeof mul];
type Grammar = ComputeGrammar<Operators>;
type Ctx = Context<{ x: "number"; y: "string" }>;

// =============================================================================
// Type-Level Tests
// =============================================================================

// Test 1: Parse simple number
type R1 = Parse<Grammar, "42", Ctx>;
type T1 = AssertEqual<R1, [NumberNode<"42">, ""]>;
const _t1: T1 = true;

// Test 2: Parse simple addition
type R2 = Parse<Grammar, "1+2", Ctx>;
type T2 = AssertEqual<R2, [AddNode<NumberNode<"1">, NumberNode<"2">>, ""]>;
const _t2: T2 = true;

// Test 3: Parse with precedence (mul binds tighter)
// "1+2*3" should parse as: Add(1, Mul(2, 3))
type R3 = Parse<Grammar, "1+2*3", Ctx>;
type ExpectedR3 = [
  AddNode<NumberNode<"1">, MulNode<NumberNode<"2">, NumberNode<"3">>>,
  ""
];
type T3 = AssertEqual<R3, ExpectedR3>;
const _t3: T3 = true;

// Test 4: Parse with remaining input
type R4 = Parse<Grammar, "42 rest", Ctx>;
type T4 = AssertEqual<R4, [NumberNode<"42">, " rest"]>;
const _t4: T4 = true;

// Test 5: No match returns []
type R5 = Parse<Grammar, "@invalid", Ctx>;
type T5 = AssertEqual<R5, []>;
const _t5: T5 = true;

// Test 6: Chained addition (left-associative would be Add(Add(1,2),3))
// But our current implementation is right-recursive: Add(1, Add(2, 3))
type R6 = Parse<Grammar, "1+2+3", Ctx>;
// Right-recursive result: Add(1, Add(2, 3))
type ExpectedR6 = [
  AddNode<NumberNode<"1">, AddNode<NumberNode<"2">, NumberNode<"3">>>,
  ""
];
type T6 = AssertEqual<R6, ExpectedR6>;
const _t6: T6 = true;

// Test 7: Precedence with mul first: "1*3+2" should be Add(Mul(1,3), 2)
// NOT Mul(1, Add(3,2)) - that would be wrong precedence
type R7 = Parse<Grammar, "1*3+2", Ctx>;
type ExpectedR7 = [
  AddNode<MulNode<NumberNode<"1">, NumberNode<"3">>, NumberNode<"2">>,
  ""
];
type T7 = AssertEqual<R7, ExpectedR7>;
const _t7: T7 = true;

// =============================================================================
// Runtime output
// =============================================================================

console.log("=== PARSE TYPE TESTS ===");
console.log("All tests pass if this file compiles!");
console.log("");
console.log("Tests:");
console.log("  T1: Parse<Grammar, \"42\", Ctx>     → [NumberNode<\"42\">, \"\"]");
console.log("  T2: Parse<Grammar, \"1+2\", Ctx>   → [BinaryNode<\"add\", ...>, \"\"]");
console.log("  T3: Parse<Grammar, \"1+2*3\", Ctx> → [Add(1, Mul(2,3)), \"\"]");
console.log("  T4: Parse<Grammar, \"42 rest\", Ctx> → [NumberNode<\"42\">, \" rest\"]");
console.log("  T5: Parse<Grammar, \"@invalid\", Ctx> → []");
console.log("  T6: Parse<Grammar, \"1+2+3\", Ctx> → [Add(1, Add(2,3)), \"\"]");
console.log("  T7: Parse<Grammar, \"1*3+2\", Ctx> → [Add(Mul(1,3), 2), \"\"]");
console.log("");
console.log("========================================");

export {};
