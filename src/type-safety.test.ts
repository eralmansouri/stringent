/**
 * Type Safety Tests
 *
 * This file tests that:
 * 1. All public APIs have proper type inference
 * 2. Type errors are comprehensible (tested via compile-time assertions)
 * 3. Common mistake scenarios produce helpful type errors
 *
 * If this file compiles, all type assertions pass.
 */

import { describe, it, expect } from "vitest";
import {
  createParser,
  defineNode,
  number,
  string,
  ident,
  constVal,
  lhs,
  rhs,
  expr,
  nullLiteral,
  booleanLiteral,
  undefinedLiteral,
  evaluate,
  infer,
  parseWithErrors,
  emptyContext,
  type Parse,
  type Infer,
  type Context,
  type EmptyContext,
  type ComputeGrammar,
  type NumberNode,
  type StringNode,
  type BooleanNode,
  type NullNode,
  type UndefinedNode,
  type BinaryNode,
  type ParseWithErrorsResult,
  type ParseResultWithErrors,
} from "./index.js";
import { typeCheck, type AssertEqual, type AssertExtends } from "./test-helpers.js";

// =============================================================================
// PART 1: Public API Type Inference
// =============================================================================

describe("Public API Type Inference", () => {
  describe("createParser() returns properly typed Parser", () => {
    const add = defineNode({
      name: "add",
      pattern: [lhs("number").as("left"), constVal("+"), rhs("number").as("right")],
      precedence: 1,
      resultType: "number",
      eval: ({ left, right }) => left + right,
    });

    const parser = createParser([add] as const);

    it("parser.parse() infers exact AST type from input literal", () => {
      const result = parser.parse("1+2", {});
      // Result should be a tuple with exact AST type
      type ResultType = typeof result;
      type IsValidResult = ResultType extends [{ node: "add" }, ""] ? true : false;
      typeCheck<IsValidResult>(true);
    });

    it("parser.nodes preserves exact node schema types", () => {
      type NodesType = typeof parser.nodes;
      type FirstNode = NodesType[0];
      type NodeName = FirstNode["name"];
      typeCheck<AssertEqual<NodeName, "add">>(true);
    });

    it("parser validates successful parsing at type level", () => {
      // Valid input works
      const valid = parser.parse("1+2", {});
      expect(valid).toHaveLength(2);

      // Type system validates that parsing succeeds
      type ValidResult = Parse<ComputeGrammar<typeof parser.nodes>, "1+2", Context<{}>>;
      type IsFullParse = ValidResult extends [unknown, ""] ? true : false;
      typeCheck<IsFullParse>(true);
    });
  });

  describe("defineNode() infers types correctly", () => {
    it("preserves exact name literal type", () => {
      const node = defineNode({
        name: "myNode",
        pattern: [number()],
        precedence: 1,
        resultType: "number",
      });
      type NodeName = typeof node.name;
      typeCheck<AssertEqual<NodeName, "myNode">>(true);
    });

    it("preserves exact pattern types", () => {
      const node = defineNode({
        name: "binary",
        pattern: [lhs("number").as("left"), constVal("*"), rhs("number").as("right")],
        precedence: 2,
        resultType: "number",
      });
      type PatternLength = typeof node.pattern.length;
      typeCheck<AssertEqual<PatternLength, 3>>(true);
    });

    it("preserves exact precedence type", () => {
      const node = defineNode({
        name: "test",
        pattern: [number()],
        precedence: 5,
        resultType: "number",
      });
      type Precedence = typeof node.precedence;
      typeCheck<AssertEqual<Precedence, 5>>(true);
    });

    it("preserves exact resultType", () => {
      const node = defineNode({
        name: "test",
        pattern: [string(['"'])],
        precedence: 1,
        resultType: "string",
      });
      type ResultType = typeof node.resultType;
      typeCheck<AssertEqual<ResultType, "string">>(true);
    });

    it("eval() parameter types match pattern bindings", () => {
      // This compiles only if eval params are correctly typed as number
      const _node = defineNode({
        name: "add",
        pattern: [lhs("number").as("a"), constVal("+"), rhs("number").as("b")],
        precedence: 1,
        resultType: "number",
        eval: ({ a, b }) => {
          // a and b should be typed as number
          const sum: number = a + b;
          return sum;
        },
      });
    });

    it("configure() parameter types are AST nodes", () => {
      // This compiles only if configure params are AST nodes with outputSchema
      const _node = defineNode({
        name: "test",
        pattern: [expr("number").as("value")],
        precedence: 1,
        resultType: "number",
        configure: ({ value }) => {
          // value should have outputSchema property
          const _schema: string = value.outputSchema;
          return { value };
        },
      });
    });
  });

  describe("evaluate() has proper types", () => {
    const add = defineNode({
      name: "add",
      pattern: [lhs("number").as("left"), constVal("+"), rhs("number").as("right")],
      precedence: 1,
      resultType: "number",
      eval: ({ left, right }) => left + right,
    });

    const parser = createParser([add] as const);

    it("returns the expected result type", () => {
      const ast = parser.parse("1+2", {})[0];
      const result = evaluate(ast, { data: {}, nodes: [add] });
      expect(result).toBe(3);
    });
  });

  describe("infer() has proper types", () => {
    it("infers number from NumberNode", () => {
      const node: NumberNode<"42"> = {
        node: "literal",
        outputSchema: "number",
        raw: "42",
        value: 42,
      };
      const result = infer(node, emptyContext);
      expect(result).toBe("number");
    });

    it("type-level Infer matches runtime infer", () => {
      type InferredFromNumber = Infer<NumberNode<"42">, EmptyContext>;
      typeCheck<AssertEqual<InferredFromNumber, "number">>(true);
    });
  });

  describe("parseWithErrors() has proper types", () => {
    const add = defineNode({
      name: "add",
      pattern: [lhs("number").as("left"), constVal("+"), rhs("number").as("right")],
      precedence: 1,
      resultType: "number",
    });

    it("returns ParseWithErrorsResult with proper success/error typing", () => {
      const result = parseWithErrors([add], "1+2", { data: {} });

      type ResultType = typeof result;
      type HasSuccess = ResultType extends { success: boolean } ? true : false;
      type HasInput = ResultType extends { input: string } ? true : false;

      typeCheck<HasSuccess>(true);
      typeCheck<HasInput>(true);

      if (result.success) {
        expect(result.ast).toBeDefined();
        expect(result.remaining).toBeDefined();
      }
    });
  });
});

// =============================================================================
// PART 2: Parse Result Type Inference (Simple Grammar)
// =============================================================================

describe("Parse Result Type Inference", () => {
  // Use a simple grammar to avoid "excessively deep" errors
  const add = defineNode({
    name: "add",
    pattern: [lhs("number").as("left"), constVal("+"), rhs("number").as("right")],
    precedence: 1,
    resultType: "number",
  });

  type SimpleNodes = readonly [typeof add];
  type SimpleGrammar = ComputeGrammar<SimpleNodes>;

  describe("Literal inference", () => {
    it("Parse infers NumberNode for numeric literals", () => {
      type Result = Parse<SimpleGrammar, "42", Context<{}>>;
      type IsNumberNode = Result extends [NumberNode<"42">, ""] ? true : false;
      typeCheck<IsNumberNode>(true);
    });

    it("Parse infers StringNode for string literals", () => {
      type Result = Parse<SimpleGrammar, '"hello"', Context<{}>>;
      type IsStringNode = Result extends [StringNode<"hello">, ""] ? true : false;
      typeCheck<IsStringNode>(true);
    });
  });

  describe("Binary operation inference", () => {
    it("infers correct output type for addition", () => {
      type Result = Parse<SimpleGrammar, "1+2", Context<{}>>;
      type OutputSchema = Result extends [{ outputSchema: infer S }, ""] ? S : never;
      typeCheck<AssertEqual<OutputSchema, "number">>(true);
    });

    it("preserves left and right types in BinaryNode", () => {
      type Result = Parse<SimpleGrammar, "1+2", Context<{}>>;
      type AST = Result extends [infer A, ""] ? A : never;
      type Left = AST extends { left: infer L } ? L : never;
      type Right = AST extends { right: infer R } ? R : never;

      type LeftIsNumber = Left extends NumberNode<"1"> ? true : false;
      type RightIsNumber = Right extends NumberNode<"2"> ? true : false;

      typeCheck<LeftIsNumber>(true);
      typeCheck<RightIsNumber>(true);
    });
  });

  describe("Context-based identifier typing", () => {
    it("resolves identifier types from context", () => {
      type Ctx = Context<{ x: "number"; y: "string" }>;
      type ResultX = Parse<SimpleGrammar, "x", Ctx>;

      type XSchema = ResultX extends [{ outputSchema: infer S }, ""] ? S : never;
      typeCheck<AssertEqual<XSchema, "number">>(true);
    });

    it("unknown identifiers get 'unknown' schema", () => {
      type Ctx = Context<{}>;
      type Result = Parse<SimpleGrammar, "foo", Ctx>;
      type Schema = Result extends [{ outputSchema: infer S }, ""] ? S : never;
      typeCheck<AssertEqual<Schema, "unknown">>(true);
    });
  });
});

// =============================================================================
// PART 3: Type Error Comprehensibility Tests
// =============================================================================

describe("Type Error Comprehensibility", () => {
  describe("No match returns empty tuple", () => {
    const add = defineNode({
      name: "add",
      pattern: [lhs("number").as("left"), constVal("+"), rhs("number").as("right")],
      precedence: 1,
      resultType: "number",
    });
    type Grammar = ComputeGrammar<readonly [typeof add]>;

    it("invalid input returns []", () => {
      type Result = Parse<Grammar, "@invalid", Context<{}>>;
      typeCheck<AssertEqual<Result, []>>(true);
    });

    it("empty input returns []", () => {
      type Result = Parse<Grammar, "", Context<{}>>;
      typeCheck<AssertEqual<Result, []>>(true);
    });
  });

  describe("Partial matches leave remaining input", () => {
    const add = defineNode({
      name: "add",
      pattern: [lhs("number").as("left"), constVal("+"), rhs("number").as("right")],
      precedence: 1,
      resultType: "number",
    });
    type Grammar = ComputeGrammar<readonly [typeof add]>;

    it("trailing content appears in remaining", () => {
      type Result = Parse<Grammar, "42 extra", Context<{}>>;
      type Remaining = Result extends [unknown, infer R] ? R : never;
      typeCheck<AssertEqual<Remaining, " extra">>(true);
    });
  });
});

// =============================================================================
// PART 4: Common Mistake Scenario Tests
// =============================================================================

describe("Common Mistake Scenarios", () => {
  describe("Incorrect pattern element usage", () => {
    it("number() without .as() captures nothing", () => {
      const node = defineNode({
        name: "test",
        pattern: [number()], // No .as() binding
        precedence: 1,
        resultType: "number",
      });
      // This should still compile - just no bindings available
      type PatternType = typeof node.pattern;
      type FirstElement = PatternType[0];
      // First element is NumberSchema (not NamedSchema)
      type IsNumberSchema = FirstElement extends { kind: "number" } ? true : false;
      typeCheck<IsNumberSchema>(true);
    });

    it("named bindings are accessible in eval()", () => {
      const node = defineNode({
        name: "test",
        pattern: [number().as("value")],
        precedence: 1,
        resultType: "number",
        eval: ({ value }) => {
          // value should be typed as number
          const _n: number = value;
          return value;
        },
      });
      expect(node.name).toBe("test");
    });
  });

  describe("Precedence ordering", () => {
    it("lower precedence binds looser (parsed first in chain)", () => {
      const add = defineNode({
        name: "add",
        pattern: [lhs("number").as("left"), constVal("+"), rhs("number").as("right")],
        precedence: 1, // Lower = binds looser
        resultType: "number",
      });

      const mul = defineNode({
        name: "mul",
        pattern: [lhs("number").as("left"), constVal("*"), rhs("number").as("right")],
        precedence: 2, // Higher = binds tighter
        resultType: "number",
      });

      const parser = createParser([add, mul] as const);
      const result = parser.parse("1+2*3", {});

      // 1+2*3 should parse as Add(1, Mul(2, 3)) due to precedence
      expect(result[0].node).toBe("add");
      expect((result[0] as { right: { node: string } }).right.node).toBe("mul");
    });
  });

  describe("Expression role constraints", () => {
    it("lhs() constrains left operand type", () => {
      const strCompare = defineNode({
        name: "strEq",
        pattern: [lhs("string").as("left"), constVal("==="), rhs("string").as("right")],
        precedence: 1,
        resultType: "boolean",
      });

      const parser = createParser([strCompare] as const);

      // String comparison should work
      const result = parser.parse('"a"==="b"', {});
      expect(result).toHaveLength(2);

      // Number comparison shouldn't match this rule
      // (will fall through to atoms, leaving remaining)
      const numResult = parser.parse("1===2", {});
      // Type constraint violation means no match - just parses "1"
      expect(numResult[1]).toBe("===2");
    });

    it("rhs() constrains right operand type", () => {
      const mixedOp = defineNode({
        name: "toStr",
        pattern: [lhs("number").as("num"), constVal("::"), rhs("string").as("fmt")],
        precedence: 1,
        resultType: "string",
      });

      const parser = createParser([mixedOp] as const);

      // Correct types work
      const valid = parser.parse('42::"format"', {});
      expect(valid[0].node).toBe("toStr");

      // Wrong RHS type leaves remaining
      const invalid = parser.parse("42::99", {});
      expect(invalid[1]).toBe("::99");
    });

    it("expr() allows any type (no constraint)", () => {
      const parens = defineNode({
        name: "group",
        pattern: [constVal("("), expr().as("inner"), constVal(")")],
        precedence: 0,
        resultType: "unknown",
      });

      const parser = createParser([parens] as const);

      // Numbers work
      const numResult = parser.parse("(42)", {});
      expect(numResult[0].node).toBe("group");

      // Strings work
      const strResult = parser.parse('("hi")', {});
      expect(strResult[0].node).toBe("group");
    });
  });

  describe("Result type usage", () => {
    it("ParseResultWithErrors type supports error tuples", () => {
      type ErrorResult = ParseResultWithErrors;
      // Should accept error tuples
      type IsValidErrorTuple = [
        { node: "test"; outputSchema: "number" },
        "",
        []
      ] extends ErrorResult ? true : false;

      typeCheck<IsValidErrorTuple>(true);
    });
  });
});

// =============================================================================
// PART 5: Schema Factory Type Tests
// =============================================================================

describe("Schema Factory Types", () => {
  describe("Primitive schema factories", () => {
    it("number() returns NumberSchema", () => {
      const schema = number();
      type SchemaKind = typeof schema.kind;
      typeCheck<AssertEqual<SchemaKind, "number">>(true);
    });

    it("string() returns StringSchema with quotes", () => {
      const schema = string(['"', "'"]);
      type SchemaKind = typeof schema.kind;
      type HasQuotes = typeof schema extends { quotes: readonly string[] } ? true : false;
      typeCheck<AssertEqual<SchemaKind, "string">>(true);
      typeCheck<HasQuotes>(true);
    });

    it("ident() returns IdentSchema", () => {
      const schema = ident();
      type SchemaKind = typeof schema.kind;
      typeCheck<AssertEqual<SchemaKind, "ident">>(true);
    });

    it("constVal() returns ConstSchema with exact value type", () => {
      const schema = constVal("+");
      type SchemaKind = typeof schema.kind;
      type Value = typeof schema.value;
      typeCheck<AssertEqual<SchemaKind, "const">>(true);
      typeCheck<AssertEqual<Value, "+">>(true);
    });

    it("nullLiteral() returns NullSchema", () => {
      const schema = nullLiteral();
      type SchemaKind = typeof schema.kind;
      typeCheck<AssertEqual<SchemaKind, "null">>(true);
    });

    it("booleanLiteral() returns BooleanSchema", () => {
      const schema = booleanLiteral();
      type SchemaKind = typeof schema.kind;
      typeCheck<AssertEqual<SchemaKind, "boolean">>(true);
    });

    it("undefinedLiteral() returns UndefinedSchema", () => {
      const schema = undefinedLiteral();
      type SchemaKind = typeof schema.kind;
      typeCheck<AssertEqual<SchemaKind, "undefined">>(true);
    });
  });

  describe("Expression schema factories", () => {
    it("lhs() returns ExprSchema with 'lhs' role", () => {
      const schema = lhs("number");
      type Role = typeof schema.role;
      typeCheck<AssertEqual<Role, "lhs">>(true);
    });

    it("rhs() returns ExprSchema with 'rhs' role", () => {
      const schema = rhs("string");
      type Role = typeof schema.role;
      typeCheck<AssertEqual<Role, "rhs">>(true);
    });

    it("expr() returns ExprSchema with 'expr' role", () => {
      const schema = expr("boolean");
      type Role = typeof schema.role;
      typeCheck<AssertEqual<Role, "expr">>(true);
    });
  });

  describe(".as() naming", () => {
    it(".as() creates NamedSchema with exact name type", () => {
      const schema = number().as("value");
      type SchemaName = typeof schema.name;
      typeCheck<AssertEqual<SchemaName, "value">>(true);
    });

    it(".as() preserves underlying schema kind", () => {
      const schema = lhs("number").as("left");
      type SchemaKind = typeof schema.kind;
      type SchemaRole = typeof schema.role;
      typeCheck<AssertEqual<SchemaKind, "expr">>(true);
      typeCheck<AssertEqual<SchemaRole, "lhs">>(true);
    });
  });
});

// =============================================================================
// PART 6: Infer Type Tests
// =============================================================================

describe("Infer Type System", () => {
  describe("Infer<> type-level inference", () => {
    it("infers 'number' from NumberNode", () => {
      type Result = Infer<NumberNode<"123">, EmptyContext>;
      typeCheck<AssertEqual<Result, "number">>(true);
    });

    it("infers 'string' from StringNode", () => {
      type Result = Infer<StringNode<"hello">, EmptyContext>;
      typeCheck<AssertEqual<Result, "string">>(true);
    });

    it("infers 'boolean' from BooleanNode", () => {
      type ResultTrue = Infer<BooleanNode<"true">, EmptyContext>;
      type ResultFalse = Infer<BooleanNode<"false">, EmptyContext>;
      typeCheck<AssertEqual<ResultTrue, "boolean">>(true);
      typeCheck<AssertEqual<ResultFalse, "boolean">>(true);
    });

    it("infers 'null' from NullNode", () => {
      type Result = Infer<NullNode, EmptyContext>;
      typeCheck<AssertEqual<Result, "null">>(true);
    });

    it("infers 'undefined' from UndefinedNode", () => {
      type Result = Infer<UndefinedNode, EmptyContext>;
      typeCheck<AssertEqual<Result, "undefined">>(true);
    });

    it("infers from BinaryNode based on outputSchema", () => {
      type AddNode = BinaryNode<"add", NumberNode<"1">, NumberNode<"2">, "number">;
      type Result = Infer<AddNode, EmptyContext>;
      typeCheck<AssertEqual<Result, "number">>(true);
    });

    it("returns never for non-AST types", () => {
      type Result1 = Infer<string, EmptyContext>;
      type Result2 = Infer<number, EmptyContext>;
      type Result3 = Infer<null, EmptyContext>;
      type Result4 = Infer<{ foo: "bar" }, EmptyContext>;

      // TypeScript's `never` type requires special handling in equality checks
      // We check that these are never by verifying they don't extend string
      type IsNever1 = [Result1] extends [never] ? true : false;
      type IsNever2 = [Result2] extends [never] ? true : false;
      type IsNever3 = [Result3] extends [never] ? true : false;
      type IsNever4 = [Result4] extends [never] ? true : false;

      typeCheck<IsNever1>(true);
      typeCheck<IsNever2>(true);
      typeCheck<IsNever3>(true);
      typeCheck<IsNever4>(true);
    });
  });
});
