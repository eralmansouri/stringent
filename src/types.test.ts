/**
 * Comprehensive Type Documentation Tests
 *
 * This file demonstrates and tests each type in the Stringent parser.
 * Each section explains a type and provides test cases that verify behavior.
 *
 * If this file compiles, all type assertions pass.
 */

import { describe, it } from "vitest";
import type { Context } from "./context.js";
import type { ComputeGrammar, Grammar } from "./grammar/index.js";
import type { Parse, BinaryNode } from "./parse/index.js";
import type { NumberNode, StringNode, IdentNode, ConstNode } from "./primitive/index.js";
import { typeCheck, type AssertEqual, type AssertExtends } from "./test-helpers.js";

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
  type Precedence,
  type NamedSchema,
  type InferEvaluatedBindings,
} from "./schema/index.js";

// =============================================================================
// PART 1: Schema Types
// =============================================================================

describe("Schema Types", () => {
  describe("Pattern Schemas", () => {
    it("NumberSchema: matches numeric literals like '42', '3.14'", () => {
      type TestNumberSchema = AssertEqual<NumberSchema, { readonly kind: "number" }>;
      typeCheck<TestNumberSchema>(true);
    });

    it("StringSchema: matches quoted strings", () => {
      type TestStringSchema = AssertEqual<
        StringSchema<readonly ["\"", "'"]>,
        { readonly kind: "string"; readonly quotes: readonly ["\"", "'"] }
      >;
      typeCheck<TestStringSchema>(true);
    });

    it("IdentSchema: matches identifiers like 'foo', 'myVar'", () => {
      type TestIdentSchema = AssertEqual<IdentSchema, { readonly kind: "ident" }>;
      typeCheck<TestIdentSchema>(true);
    });

    it("ConstSchema: matches exact string literals like '+', '=='", () => {
      type TestConstSchema = AssertEqual<
        ConstSchema<"+">,
        { readonly kind: "const"; readonly value: "+" }
      >;
      typeCheck<TestConstSchema>(true);
    });

    it("ExprSchema: matches sub-expressions with roles", () => {
      type TestExprSchemaLhsKind = ExprSchema<"number", "lhs">["kind"];
      type TestExprSchemaLhsRole = ExprSchema<"number", "lhs">["role"];
      typeCheck<AssertEqual<TestExprSchemaLhsKind, "expr">>(true);
      typeCheck<AssertEqual<TestExprSchemaLhsRole, "lhs">>(true);

      type TestExprSchemaRhsRole = ExprSchema<"number", "rhs">["role"];
      typeCheck<AssertEqual<TestExprSchemaRhsRole, "rhs">>(true);

      type TestExprSchemaExprRole = ExprSchema<"number", "expr">["role"];
      typeCheck<AssertEqual<TestExprSchemaExprRole, "expr">>(true);
    });
  });

  describe("Factory Functions", () => {
    it("number() creates NumberSchema with .as() method", () => {
      const numSchema = number();
      type TestNumFactory = AssertExtends<typeof numSchema, NumberSchema>;
      typeCheck<TestNumFactory>(true);
      type TestNumFactoryHasAs = typeof numSchema extends { as: Function } ? true : false;
      typeCheck<TestNumFactoryHasAs>(true);
    });

    it("string() creates StringSchema with specific quote types", () => {
      const strSchema = string(["\"", "'"]);
      type TestStrFactory = AssertExtends<typeof strSchema, StringSchema<readonly string[]>>;
      typeCheck<TestStrFactory>(true);
    });

    it("ident() creates IdentSchema", () => {
      const identSchema = ident();
      type TestIdentFactory = AssertExtends<typeof identSchema, IdentSchema>;
      typeCheck<TestIdentFactory>(true);
    });

    it("constVal() creates ConstSchema with the exact value type", () => {
      const plusSchema = constVal("+");
      type TestConstFactory = AssertExtends<typeof plusSchema, ConstSchema<"+">>;
      typeCheck<TestConstFactory>(true);
    });

    it("lhs() creates ExprSchema with role 'lhs'", () => {
      const lhsSchemaNum = lhs("number");
      type TestLhsFactory = AssertExtends<typeof lhsSchemaNum, ExprSchema<"number", "lhs">>;
      typeCheck<TestLhsFactory>(true);
    });

    it("rhs() creates ExprSchema with role 'rhs'", () => {
      const rhsSchemaNum = rhs("number");
      type TestRhsFactory = AssertExtends<typeof rhsSchemaNum, ExprSchema<"number", "rhs">>;
      typeCheck<TestRhsFactory>(true);
    });

    it("expr() creates ExprSchema with role 'expr' (full grammar reset)", () => {
      const exprSchemaNum = expr("number");
      type TestExprFactory = AssertExtends<typeof exprSchemaNum, ExprSchema<"number", "expr">>;
      typeCheck<TestExprFactory>(true);
    });
  });

  describe("NodeSchema", () => {
    it("Precedence is a number", () => {
      type TestPrecedence = AssertEqual<Precedence, number>;
      typeCheck<TestPrecedence>(true);
    });

    it("defineNode creates a NodeSchema with exact types preserved", () => {
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
      typeCheck<TestNodeSchema>(true);
    });
  });
});

// =============================================================================
// PART 2: AST Node Types
// =============================================================================

describe("AST Node Types", () => {
  describe("LiteralNode (NumberNode, StringNode)", () => {
    it("NumberNode<Value>: parsed number with raw string and computed numeric value", () => {
      type TestNumberNode = AssertExtends<
        NumberNode<"42">,
        { node: "literal"; outputSchema: "number"; raw: "42"; value: number }
      >;
      typeCheck<TestNumberNode>(true);
    });

    it("StringNode<Value>: parsed string with raw and value being the same", () => {
      type TestStringNode = AssertEqual<
        StringNode<"hello">,
        { node: "literal"; outputSchema: "string"; raw: "hello"; value: "hello" }
      >;
      typeCheck<TestStringNode>(true);
    });
  });

  describe("IdentNode", () => {
    it("IdentNode<Name, OutputSchema>: identifier with its resolved type", () => {
      type TestIdentNode = AssertEqual<
        IdentNode<"x", "number">,
        { node: "identifier"; outputSchema: "number"; name: "x" }
      >;
      typeCheck<TestIdentNode>(true);
    });
  });

  describe("ConstNode", () => {
    it("ConstNode<Value>: matched constant", () => {
      type TestConstNode = AssertEqual<
        ConstNode<"+">,
        { node: "const"; outputSchema: "+" }
      >;
      typeCheck<TestConstNode>(true);
    });
  });

  describe("BinaryNode", () => {
    it("BinaryNode has expected properties", () => {
      type TestBinaryNodeShape = BinaryNode<"add", NumberNode<"1">, NumberNode<"2">, "number">;
      type TestBinaryNodeHasNode = TestBinaryNodeShape["node"] extends "add" ? true : false;
      type TestBinaryNodeHasOutput = TestBinaryNodeShape["outputSchema"] extends "number" ? true : false;
      type TestBinaryNodeHasLeft = TestBinaryNodeShape["left"] extends NumberNode<"1"> ? true : false;
      type TestBinaryNodeHasRight = TestBinaryNodeShape["right"] extends NumberNode<"2"> ? true : false;
      typeCheck<TestBinaryNodeHasNode>(true);
      typeCheck<TestBinaryNodeHasOutput>(true);
      typeCheck<TestBinaryNodeHasLeft>(true);
      typeCheck<TestBinaryNodeHasRight>(true);
    });
  });
});

// =============================================================================
// PART 3: Grammar Types
// =============================================================================

describe("Grammar Types", () => {
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

  type TestNodes = readonly [typeof add, typeof mul];

  describe("Grammar (Flat Tuple Structure)", () => {
    it("Grammar is a tuple of node arrays", () => {
      type TestGrammarStructure = AssertExtends<
        Grammar,
        readonly (readonly NodeSchema[])[]
      >;
      typeCheck<TestGrammarStructure>(true);
    });
  });

  describe("ComputeGrammar", () => {
    it("computes grammar type from node schemas", () => {
      type TestGrammar = ComputeGrammar<TestNodes>;

      // Test that it's a grammar (tuple of arrays)
      type TestGrammarIsValid = TestGrammar extends Grammar ? true : false;
      typeCheck<TestGrammarIsValid>(true);

      // Test that it has 3 levels (2 operator levels + 1 built-in atom level)
      type TestGrammarLength = TestGrammar["length"] extends 3 ? true : false;
      typeCheck<TestGrammarLength>(true);

      // Test that the last level contains built-in atoms
      type LastLevel = TestGrammar extends readonly [...infer _Rest, infer Last] ? Last : never;
      type TestLastLevelHasAtoms = LastLevel extends readonly { name: string }[] ? true : false;
      typeCheck<TestLastLevelHasAtoms>(true);
    });
  });
});

// =============================================================================
// PART 4: Context Types
// =============================================================================

describe("Context Types", () => {
  it("Context<Data>: maps variable names to their types", () => {
    type TestContext = AssertEqual<
      Context<{ x: "number"; y: "string" }>,
      { readonly data: { x: "number"; y: "string" } }
    >;
    typeCheck<TestContext>(true);
  });

  it("Empty context", () => {
    type TestEmptyContext = AssertEqual<Context<{}>, { readonly data: {} }>;
    typeCheck<TestEmptyContext>(true);
  });
});

// =============================================================================
// PART 5: Parse Type
// =============================================================================

describe("Parse Type", () => {
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

  type TestNodes = readonly [typeof add, typeof mul];
  type TestGrammarComputed = ComputeGrammar<TestNodes>;
  type Ctx = Context<{ x: "number"; y: "string" }>;

  describe("Simple Atoms", () => {
    it("Parse a number: '42' → [NumberNode<'42'>, '']", () => {
      type P1 = Parse<TestGrammarComputed, "42", Ctx>;
      type T1 = AssertEqual<P1, [NumberNode<"42">, ""]>;
      typeCheck<T1>(true);
    });

    it("Parse a string: '\"hello\"' → [StringNode<'hello'>, '']", () => {
      type P2 = Parse<TestGrammarComputed, "\"hello\"", Ctx>;
      type T2 = AssertEqual<P2, [StringNode<"hello">, ""]>;
      typeCheck<T2>(true);
    });
  });

  describe("Binary Operations", () => {
    it("Parse addition: '1+2' → [AddNode<...>, '']", () => {
      type P3 = Parse<TestGrammarComputed, "1+2", Ctx>;
      type T3 = AssertEqual<P3, [AddNode<NumberNode<"1">, NumberNode<"2">>, ""]>;
      typeCheck<T3>(true);
    });

    it("Parse multiplication: '3*4' → [MulNode<...>, '']", () => {
      type P4 = Parse<TestGrammarComputed, "3*4", Ctx>;
      type T4 = AssertEqual<P4, [MulNode<NumberNode<"3">, NumberNode<"4">>, ""]>;
      typeCheck<T4>(true);
    });
  });

  describe("Precedence", () => {
    it("'1+2*3' → Add(1, Mul(2, 3)) - mul binds tighter", () => {
      type P5 = Parse<TestGrammarComputed, "1+2*3", Ctx>;
      type Expected5 = [
        AddNode<NumberNode<"1">, MulNode<NumberNode<"2">, NumberNode<"3">>>,
        ""
      ];
      type T5 = AssertEqual<P5, Expected5>;
      typeCheck<T5>(true);
    });

    it("'1*3+2' → Add(Mul(1, 3), 2) - mul binds tighter", () => {
      type P6 = Parse<TestGrammarComputed, "1*3+2", Ctx>;
      type Expected6 = [
        AddNode<MulNode<NumberNode<"1">, NumberNode<"3">>, NumberNode<"2">>,
        ""
      ];
      type T6 = AssertEqual<P6, Expected6>;
      typeCheck<T6>(true);
    });

    it("'2*3*4' → Mul(2, Mul(3, 4)) - right-associative at same level", () => {
      type P7 = Parse<TestGrammarComputed, "2*3*4", Ctx>;
      type Expected7 = [
        MulNode<NumberNode<"2">, MulNode<NumberNode<"3">, NumberNode<"4">>>,
        ""
      ];
      type T7 = AssertEqual<P7, Expected7>;
      typeCheck<T7>(true);
    });
  });

  describe("Remaining Input", () => {
    it("'42 rest' → [NumberNode<'42'>, ' rest']", () => {
      type P8 = Parse<TestGrammarComputed, "42 rest", Ctx>;
      type T8 = AssertEqual<P8, [NumberNode<"42">, " rest"]>;
      typeCheck<T8>(true);
    });
  });

  describe("No Match", () => {
    it("'@invalid' → []", () => {
      type P9 = Parse<TestGrammarComputed, "@invalid", Ctx>;
      type T9 = AssertEqual<P9, []>;
      typeCheck<T9>(true);
    });
  });
});

// =============================================================================
// PART 6: Complex Examples
// =============================================================================

describe("Complex Examples", () => {
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

  type TestNodes = readonly [typeof add, typeof mul];
  type TestGrammarComputed = ComputeGrammar<TestNodes>;
  type Ctx = Context<{ x: "number"; y: "string" }>;

  it("Chained operations: '1+2+3' → Add(1, Add(2, 3))", () => {
    type P10 = Parse<TestGrammarComputed, "1+2+3", Ctx>;
    type Expected10 = [
      AddNode<NumberNode<"1">, AddNode<NumberNode<"2">, NumberNode<"3">>>,
      ""
    ];
    type T10 = AssertEqual<P10, Expected10>;
    typeCheck<T10>(true);
  });

  it("Mixed precedence chain: '1+2*3+4' → Add(1, Add(Mul(2, 3), 4))", () => {
    type P11 = Parse<TestGrammarComputed, "1+2*3+4", Ctx>;
    type Expected11 = [
      AddNode<
        NumberNode<"1">,
        AddNode<MulNode<NumberNode<"2">, NumberNode<"3">>, NumberNode<"4">>
      >,
      ""
    ];
    type T11 = AssertEqual<P11, Expected11>;
    typeCheck<T11>(true);
  });
});

// =============================================================================
// PART 7: eval() and configure() Typing
// =============================================================================

describe("eval() and configure() Typing", () => {
  describe("InferEvaluatedBindings Type", () => {
    it("extracts evaluated (runtime) types from a pattern", () => {
      type TestEvalPattern = readonly [
        NamedSchema<ExprSchema<"number", "lhs">, "left">,
        ConstSchema<"+">,
        NamedSchema<ExprSchema<"number", "rhs">, "right">
      ];

      type TestEvalBindings = InferEvaluatedBindings<TestEvalPattern>;

      // Verify left and right are typed as number
      type T12_LeftIsNumber = TestEvalBindings["left"] extends number ? true : false;
      type T12_RightIsNumber = TestEvalBindings["right"] extends number ? true : false;

      typeCheck<T12_LeftIsNumber>(true);
      typeCheck<T12_RightIsNumber>(true);
    });
  });

  describe("defineNode eval() Function Typing", () => {
    it("eval() parameters are properly typed based on InferEvaluatedBindings", () => {
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
      // If this compiles, the types are correct
      void addWithEval;
    });
  });

  describe("defineNode configure() Function Typing", () => {
    it("configure() receives AST nodes (with outputSchema), not primitive values", () => {
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
      // If this compiles, the types are correct
      void addWithConfigure;
    });
  });
});
