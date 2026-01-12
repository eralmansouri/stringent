/**
 * Comprehensive Type Documentation Tests
 *
 * This file demonstrates and tests each type in the Stringent parser.
 * Each section explains a type and provides test cases that verify behavior.
 *
 * If this file compiles, all type assertions pass.
 */

import type { Context } from "./context.js";
import type { ComputeGrammar, Grammar } from "./grammar/index.js";
import type { Parse, BinaryNode } from "./parse/index.js";
import type { NumberNode, StringNode, IdentNode, ConstNode } from "./primitive/index.js";

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
import {
  defineNode,
  number,
  string,
  ident,
  constVal,
  lhs,
  rhs,
  expr,
  type NodeSchema,
  type NumberSchema,
  type StringSchema,
  type IdentSchema,
  type ConstSchema,
  type ExprSchema,
  type ExprRole,
  type Precedence,
  type NamedSchema,
  type InferEvaluatedBindings,
} from "./schema/index.js";

// =============================================================================
// Type Assertion Helpers
// =============================================================================

/** Asserts two types are exactly equal */
type AssertEqual<T, Expected> = T extends Expected
  ? Expected extends T
    ? true
    : false
  : false;

/** Asserts a type extends another */
type AssertExtends<T, Base> = T extends Base ? true : false;

// =============================================================================
// PART 1: Schema Types
// =============================================================================
//
// Schema types define the structure of grammar nodes. They're created with
// factory functions that preserve literal types.

console.log("=== PART 1: Schema Types ===");

// -----------------------------------------------------------------------------
// 1.1 Pattern Schemas
// -----------------------------------------------------------------------------
//
// Pattern elements describe what a grammar rule matches.

// NumberSchema: matches numeric literals like "42", "3.14"
type TestNumberSchema = AssertEqual<NumberSchema, { readonly kind: "number" }>;
const _testNumberSchema: TestNumberSchema = true;

// StringSchema: matches quoted strings like '"hello"', "'world'"
type TestStringSchema = AssertEqual<
  StringSchema<readonly ["\"", "'"]>,
  { readonly kind: "string"; readonly quotes: readonly ["\"", "'"] }
>;
const _testStringSchema: TestStringSchema = true;

// IdentSchema: matches identifiers like "foo", "myVar"
type TestIdentSchema = AssertEqual<IdentSchema, { readonly kind: "ident" }>;
const _testIdentSchema: TestIdentSchema = true;

// ConstSchema: matches exact string literals like "+", "=="
type TestConstSchema = AssertEqual<
  ConstSchema<"+">,
  { readonly kind: "const"; readonly value: "+" }
>;
const _testConstSchema: TestConstSchema = true;

// ExprSchema: matches a sub-expression with a role and optional type constraint
// Role determines grammar level: "lhs" (next), "rhs" (current), "expr" (full)
// Test that ExprSchema with different roles has the correct properties
type TestExprSchemaLhsKind = ExprSchema<"number", "lhs">["kind"];
type TestExprSchemaLhsRole = ExprSchema<"number", "lhs">["role"];
const _testExprSchemaLhsKind: AssertEqual<TestExprSchemaLhsKind, "expr"> = true;
const _testExprSchemaLhsRole: AssertEqual<TestExprSchemaLhsRole, "lhs"> = true;

type TestExprSchemaRhsRole = ExprSchema<"number", "rhs">["role"];
const _testExprSchemaRhsRole: AssertEqual<TestExprSchemaRhsRole, "rhs"> = true;

type TestExprSchemaExprRole = ExprSchema<"number", "expr">["role"];
const _testExprSchemaExprRole: AssertEqual<TestExprSchemaExprRole, "expr"> = true;

// -----------------------------------------------------------------------------
// 1.2 Factory Functions
// -----------------------------------------------------------------------------
//
// Factory functions create pattern schemas with preserved literal types.
// All factories now return SchemaWithAs<T> which is T & { as(name): NamedSchema }

// number() creates NumberSchema (with .as() method)
const numSchema = number();
type TestNumFactory = AssertExtends<typeof numSchema, NumberSchema>;
const _testNumFactory: TestNumFactory = true;
// Verify .as() method exists
type TestNumFactoryHasAs = typeof numSchema extends { as: Function } ? true : false;
const _testNumFactoryHasAs: TestNumFactoryHasAs = true;

// string() creates StringSchema with specific quote types
const strSchema = string(["\"", "'"]);
type TestStrFactory = AssertExtends<typeof strSchema, StringSchema<readonly string[]>>;
const _testStrFactory: TestStrFactory = true;

// ident() creates IdentSchema
const identSchema = ident();
type TestIdentFactory = AssertExtends<typeof identSchema, IdentSchema>;
const _testIdentFactory: TestIdentFactory = true;

// constVal() creates ConstSchema with the exact value type
const plusSchema = constVal("+");
type TestConstFactory = AssertExtends<typeof plusSchema, ConstSchema<"+">>;
const _testConstFactory: TestConstFactory = true;

// lhs() creates ExprSchema with role "lhs"
const lhsSchemaNum = lhs("number");
type TestLhsFactory = AssertExtends<typeof lhsSchemaNum, ExprSchema<"number", "lhs">>;
const _testLhsFactory: TestLhsFactory = true;

// rhs() creates ExprSchema with role "rhs"
const rhsSchemaNum = rhs("number");
type TestRhsFactory = AssertExtends<typeof rhsSchemaNum, ExprSchema<"number", "rhs">>;
const _testRhsFactory: TestRhsFactory = true;

// expr() creates ExprSchema with role "expr" (full grammar reset)
const exprSchemaNum = expr("number");
type TestExprFactory = AssertExtends<typeof exprSchemaNum, ExprSchema<"number", "expr">>;
const _testExprFactory: TestExprFactory = true;

// -----------------------------------------------------------------------------
// 1.3 NodeSchema
// -----------------------------------------------------------------------------
//
// NodeSchema defines a complete grammar rule: name, pattern, precedence, resultType.

// Precedence is a number for operators (lower = binds looser)
// Atoms are now built-in and don't use precedence
type TestPrecedence = AssertEqual<Precedence, number>;
const _testPrecedence: TestPrecedence = true;

// defineNode creates a NodeSchema with exact types preserved
const exampleNode = defineNode({
  name: "add",
  pattern: [lhs("number"), constVal("+"), rhs("number")],
  precedence: 1,
  resultType: "number",
});

type TestNodeSchema = AssertExtends<
  typeof exampleNode,
  NodeSchema<"add", readonly [ExprSchema<"number", "lhs">, ConstSchema<"+">, ExprSchema<"number", "rhs">], 1, "number">
>;
const _testNodeSchema: TestNodeSchema = true;

console.log("  1.1 Pattern Schemas: OK");
console.log("  1.2 Factory Functions: OK");
console.log("  1.3 NodeSchema: OK");

// =============================================================================
// PART 2: AST Node Types
// =============================================================================
//
// AST node types represent the parsed structure.

console.log("");
console.log("=== PART 2: AST Node Types ===");

// -----------------------------------------------------------------------------
// 2.1 LiteralNode (NumberNode, StringNode)
// -----------------------------------------------------------------------------
//
// LiteralNode represents parsed literals. NumberNode and StringNode are type aliases.
// New structure: { node: "literal", outputSchema: <type>, raw: <rawValue>, value: <parsedValue> }

// NumberNode<Value>: parsed number with raw string and computed numeric value
// Note: The value type is computed at compile-time using hotscript's ToNumber
type TestNumberNode = AssertExtends<
  NumberNode<"42">,
  { node: "literal"; outputSchema: "number"; raw: "42"; value: number }
>;
const _testNumberNode: TestNumberNode = true;

// StringNode<Value>: parsed string with raw and value being the same
type TestStringNode = AssertEqual<
  StringNode<"hello">,
  { node: "literal"; outputSchema: "string"; raw: "hello"; value: "hello" }
>;
const _testStringNode: TestStringNode = true;

// -----------------------------------------------------------------------------
// 2.2 IdentNode
// -----------------------------------------------------------------------------
//
// IdentNode represents a parsed identifier, with its type resolved from context.
// New structure: { node: "identifier", outputSchema: <resolvedType>, name: <identifierName> }

// IdentNode<Name, OutputSchema>: identifier with its resolved type
type TestIdentNode = AssertEqual<
  IdentNode<"x", "number">,
  { node: "identifier"; outputSchema: "number"; name: "x" }
>;
const _testIdentNode: TestIdentNode = true;

// -----------------------------------------------------------------------------
// 2.3 ConstNode
// -----------------------------------------------------------------------------
//
// ConstNode represents a matched constant (like "+", "==").
// New structure: { node: "const", outputSchema: <value> }

type TestConstNode = AssertEqual<
  ConstNode<"+">,
  { node: "const"; outputSchema: "+" }
>;
const _testConstNode: TestConstNode = true;

// -----------------------------------------------------------------------------
// 2.4 BinaryNode
// -----------------------------------------------------------------------------
//
// BinaryNode represents a binary operation with left and right children.
// New structure: { node: <name>, outputSchema: <type>, left: <leftNode>, right: <rightNode> }

// BinaryNode<Name, Left, Right, OutputSchema>
type TestBinaryNodeShape = BinaryNode<"add", NumberNode<"1">, NumberNode<"2">, "number">;
// Just verify it has the expected properties
type TestBinaryNodeHasNode = TestBinaryNodeShape["node"] extends "add" ? true : false;
type TestBinaryNodeHasOutput = TestBinaryNodeShape["outputSchema"] extends "number" ? true : false;
type TestBinaryNodeHasLeft = TestBinaryNodeShape["left"] extends NumberNode<"1"> ? true : false;
type TestBinaryNodeHasRight = TestBinaryNodeShape["right"] extends NumberNode<"2"> ? true : false;
const _testBinaryNode1: TestBinaryNodeHasNode = true;
const _testBinaryNode2: TestBinaryNodeHasOutput = true;
const _testBinaryNode3: TestBinaryNodeHasLeft = true;
const _testBinaryNode4: TestBinaryNodeHasRight = true;

console.log("  2.1 LiteralNode (NumberNode, StringNode): OK");
console.log("  2.2 IdentNode: OK");
console.log("  2.3 ConstNode: OK");
console.log("  2.4 BinaryNode: OK");

// =============================================================================
// PART 3: Grammar Types
// =============================================================================
//
// Grammar types describe the precedence structure computed from node schemas.

console.log("");
console.log("=== PART 3: Grammar Types ===");

// Define operators for testing grammar computation
// Atoms (number, string, identifier, parentheses) are now built-in

const add = defineNode({
  name: "add",
  pattern: [lhs("number").as("left"), constVal("+"), rhs("number").as("right")],
  precedence: 1, // Lower precedence (parsed first, outermost in tree)
  resultType: "number",
});

const mul = defineNode({
  name: "mul",
  pattern: [lhs("number").as("left"), constVal("*"), rhs("number").as("right")],
  precedence: 2, // Higher precedence (binds tighter)
  resultType: "number",
});

// Only operators - atoms are built-in and automatically appended
type TestNodes = readonly [typeof add, typeof mul];

// -----------------------------------------------------------------------------
// 3.1 Grammar (Flat Tuple Structure)
// -----------------------------------------------------------------------------
//
// Grammar is a flat tuple of precedence levels:
//   [[ops@prec1], [ops@prec2], ..., [atoms]]
//
// Levels are sorted by precedence ascending (lowest first).
// Atoms are always the last element.

// Grammar is just a tuple of node arrays
type TestGrammarStructure = AssertExtends<
  Grammar,
  readonly (readonly NodeSchema[])[]
>;
const _testGrammarStructure: TestGrammarStructure = true;

// -----------------------------------------------------------------------------
// 3.2 ComputeGrammar
// -----------------------------------------------------------------------------
//
// ComputeGrammar<Nodes> computes the full grammar type from node schemas.
// Operators are sorted by precedence ascending (lowest first).
// Atoms are placed at the end.

type TestGrammar = ComputeGrammar<TestNodes>;

// The grammar should be:
//   [[add], [mul], [BuiltInAtoms]]
//
// Index 0: add (prec 1, lowest)
// Index 1: mul (prec 2, higher)
// Index 2: built-in atoms (always last)

// Test that it's a grammar (tuple of arrays)
type TestGrammarIsValid = TestGrammar extends Grammar ? true : false;
const _testGrammarIsValid: TestGrammarIsValid = true;

// Test that it has 3 levels (2 operator levels + 1 built-in atom level)
type TestGrammarLength = TestGrammar["length"] extends 3 ? true : false;
const _testGrammarLength: TestGrammarLength = true;

// Test that the last level contains built-in atoms
// Built-in atoms include: numberLiteral, stringLiteral, identifier, parentheses
type LastLevel = TestGrammar extends readonly [...infer _Rest, infer Last] ? Last : never;
type TestLastLevelHasAtoms = LastLevel extends readonly { name: string }[] ? true : false;
const _testLastLevelHasAtoms: TestLastLevelHasAtoms = true;

console.log("  3.1 Grammar (flat tuple): OK");
console.log("  3.2 ComputeGrammar: OK");

// =============================================================================
// PART 4: Context Types
// =============================================================================
//
// Context carries schema data for identifier type resolution.

console.log("");
console.log("=== PART 4: Context Types ===");

// Context<Data>: maps variable names to their types
type TestContext = AssertEqual<
  Context<{ x: "number"; y: "string" }>,
  { readonly data: { x: "number"; y: "string" } }
>;
const _testContext: TestContext = true;

// Empty context
type TestEmptyContext = AssertEqual<Context<{}>, { readonly data: {} }>;
const _testEmptyContext: TestEmptyContext = true;

console.log("  4.1 Context<Data>: OK");

// =============================================================================
// PART 5: Parse Type
// =============================================================================
//
// Parse<TestGrammarComputed, Input, Context> is the main type-level parsing type.

console.log("");
console.log("=== PART 5: Parse Type ===");

type TestGrammarComputed = ComputeGrammar<TestNodes>;
type Ctx = Context<{ x: "number"; y: "string" }>;

// -----------------------------------------------------------------------------
// 5.1 Simple Atoms
// -----------------------------------------------------------------------------

// Parse a number: "42" → [NumberNode<"42">, ""]
type P1 = Parse<TestGrammarComputed, "42", Ctx>;
type T1 = AssertEqual<P1, [NumberNode<"42">, ""]>;
const _t1: T1 = true;

// Parse a string: '"hello"' → [StringNode<"hello">, ""]
type P2 = Parse<TestGrammarComputed, "\"hello\"", Ctx>;
type T2 = AssertEqual<P2, [StringNode<"hello">, ""]>;
const _t2: T2 = true;

console.log("  5.1 Simple Atoms: OK");
console.log("      Parse '42' → [NumberNode<\"42\">, \"\"]");
console.log("      Parse '\"hello\"' → [StringNode<\"hello\">, \"\"]");

// -----------------------------------------------------------------------------
// 5.2 Binary Operations
// -----------------------------------------------------------------------------

// Parse addition: "1+2" → [AddNode<...>, ""]
type P3 = Parse<TestGrammarComputed, "1+2", Ctx>;
type T3 = AssertEqual<P3, [AddNode<NumberNode<"1">, NumberNode<"2">>, ""]>;
const _t3: T3 = true;

// Parse multiplication: "3*4" → [MulNode<...>, ""]
type P4 = Parse<TestGrammarComputed, "3*4", Ctx>;
type T4 = AssertEqual<P4, [MulNode<NumberNode<"3">, NumberNode<"4">>, ""]>;
const _t4: T4 = true;

console.log("  5.2 Binary Operations: OK");
console.log("      Parse '1+2' → [BinaryNode<\"add\", 1, 2>, \"\"]");
console.log("      Parse '3*4' → [BinaryNode<\"mul\", 3, 4>, \"\"]");

// -----------------------------------------------------------------------------
// 5.3 Precedence
// -----------------------------------------------------------------------------
//
// mul has precedence 2 (higher), add has precedence 1 (lower).
// Higher precedence binds tighter: 1+2*3 → Add(1, Mul(2,3))

// "1+2*3" → Add(1, Mul(2, 3))
type P5 = Parse<TestGrammarComputed, "1+2*3", Ctx>;
type Expected5 = [
  AddNode<NumberNode<"1">, MulNode<NumberNode<"2">, NumberNode<"3">>>,
  ""
];
type T5 = AssertEqual<P5, Expected5>;
const _t5: T5 = true;

// "1*3+2" → Add(Mul(1, 3), 2)
type P6 = Parse<TestGrammarComputed, "1*3+2", Ctx>;
type Expected6 = [
  AddNode<MulNode<NumberNode<"1">, NumberNode<"3">>, NumberNode<"2">>,
  ""
];
type T6 = AssertEqual<P6, Expected6>;
const _t6: T6 = true;

// "2*3*4" → Mul(2, Mul(3, 4)) (right-associative at same level)
type P7 = Parse<TestGrammarComputed, "2*3*4", Ctx>;
type Expected7 = [
  MulNode<NumberNode<"2">, MulNode<NumberNode<"3">, NumberNode<"4">>>,
  ""
];
type T7 = AssertEqual<P7, Expected7>;
const _t7: T7 = true;

console.log("  5.3 Precedence: OK");
console.log("      Parse '1+2*3' → Add(1, Mul(2, 3)) ✓ mul binds tighter");
console.log("      Parse '1*3+2' → Add(Mul(1, 3), 2) ✓ mul binds tighter");
console.log("      Parse '2*3*4' → Mul(2, Mul(3, 4)) ✓ right-associative");

// -----------------------------------------------------------------------------
// 5.4 Remaining Input
// -----------------------------------------------------------------------------
//
// Parse returns [node, remaining] where remaining is unparsed input.

// "42 rest" → [NumberNode<"42">, " rest"]
type P8 = Parse<TestGrammarComputed, "42 rest", Ctx>;
type T8 = AssertEqual<P8, [NumberNode<"42">, " rest"]>;
const _t8: T8 = true;

console.log("  5.4 Remaining Input: OK");
console.log("      Parse '42 rest' → [NumberNode<\"42\">, \" rest\"]");

// -----------------------------------------------------------------------------
// 5.5 No Match
// -----------------------------------------------------------------------------
//
// When nothing matches, Parse returns [].

type P9 = Parse<TestGrammarComputed, "@invalid", Ctx>;
type T9 = AssertEqual<P9, []>;
const _t9: T9 = true;

console.log("  5.5 No Match: OK");
console.log("      Parse '@invalid' → []");

// =============================================================================
// PART 6: Complex Examples
// =============================================================================

console.log("");
console.log("=== PART 6: Complex Examples ===");

// Chained operations: "1+2+3" → Add(1, Add(2, 3))
type P10 = Parse<TestGrammarComputed, "1+2+3", Ctx>;
type Expected10 = [
  AddNode<NumberNode<"1">, AddNode<NumberNode<"2">, NumberNode<"3">>>,
  ""
];
type T10 = AssertEqual<P10, Expected10>;
const _t10: T10 = true;

// Mixed precedence chain: "1+2*3+4" → Add(1, Add(Mul(2, 3), 4))
// Wait, let's trace this:
// - Start at add level
// - Left: parse at mul level → parse at atoms → "1"
// - Match "+"
// - Right: parse at add level → "2*3+4"
//   - Left: parse at mul level → "2*3"
//     - Left: atoms → "2"
//     - Match "*"
//     - Right: mul level → "3" (atoms)
//     - Result: Mul(2, 3)
//   - Match "+"
//   - Right: add level → "4"
//   - Result: Add(Mul(2, 3), 4)
// - Result: Add(1, Add(Mul(2, 3), 4))
type P11 = Parse<TestGrammarComputed, "1+2*3+4", Ctx>;
type Expected11 = [
  AddNode<
    NumberNode<"1">,
    AddNode<MulNode<NumberNode<"2">, NumberNode<"3">>, NumberNode<"4">>
  >,
  ""
];
type T11 = AssertEqual<P11, Expected11>;
const _t11: T11 = true;

console.log("  6.1 Chained: '1+2+3' → Add(1, Add(2, 3))");
console.log("  6.2 Mixed: '1+2*3+4' → Add(1, Add(Mul(2, 3), 4))");

// =============================================================================
// PART 7: eval() and configure() Typing
// =============================================================================
//
// This section verifies that defineNode correctly types the eval and configure
// functions. The key insight: even though stored types (EvalFn, ConfigureFn)
// are loose for variance reasons, the definition-time types are fully typed.

console.log("");
console.log("=== PART 7: eval() and configure() Typing ===");

// Note: NamedSchema and InferEvaluatedBindings are imported at top of file

// -----------------------------------------------------------------------------
// 7.1 InferEvaluatedBindings Type
// -----------------------------------------------------------------------------
//
// InferEvaluatedBindings extracts the evaluated (runtime) types from a pattern.
// For ExprSchema, it uses the constraint to determine the type.

type TestEvalPattern = readonly [
  NamedSchema<ExprSchema<"number", "lhs">, "left">,
  ConstSchema<"+">,
  NamedSchema<ExprSchema<"number", "rhs">, "right">
];

type TestEvalBindings = InferEvaluatedBindings<TestEvalPattern>;

// Verify left and right are typed as number
type T12_LeftIsNumber = TestEvalBindings["left"] extends number ? true : false;
type T12_RightIsNumber = TestEvalBindings["right"] extends number ? true : false;

const _t12_left: T12_LeftIsNumber = true;
const _t12_right: T12_RightIsNumber = true;

console.log("  7.1 InferEvaluatedBindings: OK");
console.log("      { left: number, right: number } extracted from pattern");

// -----------------------------------------------------------------------------
// 7.2 defineNode eval() Function Typing
// -----------------------------------------------------------------------------
//
// When you define a node with eval(), the parameters are properly typed based
// on InferEvaluatedBindings, not the loose EvalFn storage type.

const addWithEval = defineNode({
  name: "addWithEval",
  pattern: [lhs("number").as("left"), constVal("+"), rhs("number").as("right")],
  precedence: 1,
  resultType: "number",
  eval: ({ left, right }) => {
    // These assignments verify that left and right are typed as number
    const _l: number = left;
    const _r: number = right;
    return left + right;
  },
});

console.log("  7.2 defineNode eval() typing: OK");
console.log("      eval({ left, right }) receives left: number, right: number");

// -----------------------------------------------------------------------------
// 7.3 defineNode configure() Function Typing
// -----------------------------------------------------------------------------
//
// configure() receives AST nodes (with outputSchema), not primitive values.

const addWithConfigure = defineNode({
  name: "addWithConfigure",
  pattern: [lhs("number").as("left"), constVal("+"), rhs("number").as("right")],
  precedence: 1,
  resultType: "number",
  configure: ({ left, right }) => {
    // configure receives AST nodes with outputSchema
    const _leftSchema: string = left.outputSchema;
    const _rightSchema: string = right.outputSchema;
    return { left, right };
  },
});

console.log("  7.3 defineNode configure() typing: OK");
console.log("      configure({ left, right }) receives AST nodes with outputSchema");

// =============================================================================
// Summary
// =============================================================================

console.log("");
console.log("========================================");
console.log("All type tests pass!");
console.log("========================================");
console.log("");
console.log("Type System Summary:");
console.log("  - Schema Types: defineNode, number(), string(), ident(), constVal(), expr()");
console.log("  - AST Types: NumberNode, StringNode, IdentNode, ConstNode, BinaryNode");
console.log("  - Grammar Types: Grammar, ComputeGrammar");
console.log("  - Parse Type: Parse<TestGrammarComputed, Input, Context>");
console.log("");
console.log("Key Concepts:");
console.log("  - Precedence: lower number = lower precedence (outermost in tree)");
console.log("  - Associativity: right-associative at same precedence level");
console.log("  - Type constraints: expr(\"number\") only matches number-typed expressions");

export {};
