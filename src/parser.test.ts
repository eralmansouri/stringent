/**
 * Runtime parser tests: AST shapes, precedence, associativity, polymorphic
 * nodes (sameAs/fromBinding/union constraints), paths, whitespace rules and
 * diagnostics.
 *
 * The expected AST objects here are mirrored by type-level assertions in
 * src/types.typetest.ts — together they pin both engines to the same
 * behavior (parity suite).
 */

import { describe, expect, it } from "vitest";
import {
  createParser,
  defineNode,
} from "./index.js";
import { fixtureParser as parser, formSchema } from "./__fixtures__/grammar.js";

// Expected-AST builders (match the runtime node shapes exactly)
const num = (raw: string) => ({
  node: "literal",
  raw,
  value: +raw,
  outputSchema: "number",
});
const str = (value: string) => ({
  node: "literal",
  raw: value,
  value,
  outputSchema: "string",
});
const pathNode = (segments: string[], outputSchema: string) => ({
  node: "path",
  path: segments,
  outputSchema,
});
const bin = (node: string, outputSchema: string, left: unknown, right: unknown) => ({
  node,
  outputSchema,
  left,
  right,
});

function parseOk(input: string, schema: Record<string, unknown> = {}) {
  const result = parser.safeParse(input, schema as never);
  if (!result.success) {
    throw new Error(`expected '${input}' to parse, got: ${result.error.message}`);
  }
  return result.ast;
}

function parseErr(input: string, schema: Record<string, unknown> = {}) {
  const result = parser.safeParse(input, schema as never);
  if (result.success) {
    throw new Error(`expected '${input}' to fail, got: ${JSON.stringify(result.ast)}`);
  }
  return result.error;
}

describe("atoms", () => {
  it("parses numbers", () => {
    expect(parseOk("42")).toEqual(num("42"));
  });

  it("parses strings", () => {
    expect(parseOk("'hello'")).toEqual(str("hello"));
  });

  it("parses identifiers as single-segment paths", () => {
    expect(parseOk("x", formSchema)).toEqual(pathNode(["x"], "number"));
  });

  it("resolves unknown identifiers to outputSchema 'unknown'", () => {
    expect(parseOk("nope")).toEqual(pathNode(["nope"], "unknown"));
  });
});

describe("keyword literals (const-pattern nodes)", () => {
  it("parses true/false as const nodes typed boolean", () => {
    expect(parseOk("true")).toEqual({ node: "true", outputSchema: "boolean" });
    expect(parseOk(" false ")).toEqual({ node: "false", outputSchema: "boolean" });
  });

  it("parses null and undefined", () => {
    expect(parseOk("null")).toEqual({ node: "null", outputSchema: "null" });
    expect(parseOk("undefined")).toEqual({
      node: "undefined",
      outputSchema: "undefined",
    });
  });

  it("word-boundary rule: 'nullable' is an identifier, not null + 'able'", () => {
    expect(parseOk("nullable", { nullable: "number" })).toEqual(
      pathNode(["nullable"], "number")
    );
    expect(parseOk("truthy", { truthy: "string" })).toEqual(
      pathNode(["truthy"], "string")
    );
    expect(parseOk("undefinedish", { undefinedish: "string" })).toEqual(
      pathNode(["undefinedish"], "string")
    );
  });

  it("keyword types feed constraints: boolean satisfies ternary's cond", () => {
    const ast = parseOk("true ? 1 : 2");
    expect(ast).toMatchObject({ node: "ternary", outputSchema: "number" });
  });

  it("non-boolean keywords do not satisfy boolean slots", () => {
    const error = parseErr("null ? 1 : 2");
    expect(error.message).toBeTruthy();
  });

  it("null overlaps a nullable identifier in eq, but not a number", () => {
    expect(parseOk("x == null", { x: "string | null" })).toMatchObject({
      node: "eq",
      outputSchema: "boolean",
    });
    parseErr("1 == null");
  });
});

describe("string escapes", () => {
  // Written source-escaped: '"a\\"b"' is the 7-char input  "a\"b"
  it("an escaped quote does NOT terminate the string (the parsebox difference)", () => {
    expect(parseOk('"a\\"b"')).toEqual({
      node: "literal",
      raw: 'a\\"b',
      value: 'a"b',
      outputSchema: "string",
    });
    expect(parseOk("'it\\'s'")).toEqual({
      node: "literal",
      raw: "it\\'s",
      value: "it's",
      outputSchema: "string",
    });
  });

  it("simple escapes produce real characters in the value", () => {
    expect(parseOk('"line1\\nline2"')).toMatchObject({ value: "line1\nline2" });
    expect(parseOk('"a\\tb"')).toMatchObject({ value: "a\tb" });
    expect(parseOk('"a\\\\b"')).toMatchObject({ value: "a\\b" });
    expect(parseOk('"a\\0b"')).toMatchObject({ value: "a\0b" });
    expect(parseOk('"\\b\\f\\v\\r"')).toMatchObject({ value: "\b\f\v\r" });
  });

  it("hex and unicode escapes decode (runtime only)", () => {
    expect(parseOk('"\\x41\\x62"')).toMatchObject({ value: "Ab" });
    expect(parseOk('"\\u0041\\u00e9"')).toMatchObject({ value: "Aé" });
  });

  it("unknown escapes resolve to the escaped character (JS semantics)", () => {
    expect(parseOk('"a\\qb"')).toMatchObject({ value: "aqb" });
  });

  it("rejects unterminated strings and malformed hex escapes", () => {
    parseErr('"abc');
    parseErr('"abc\\"'); // the only quote is escaped → unterminated
    parseErr('"\\xZZ"');
    parseErr('"\\u12"'); // \u needs exactly 4 hex digits
  });
});

describe("precedence", () => {
  it("mul binds tighter than add: 1+2*3", () => {
    expect(parseOk("1+2*3")).toEqual(
      bin("add", "number", num("1"), bin("mul", "number", num("2"), num("3")))
    );
  });

  it("mul binds tighter than add: 1*3+2", () => {
    expect(parseOk("1*3+2")).toEqual(
      bin("add", "number", bin("mul", "number", num("1"), num("3")), num("2"))
    );
  });

  it("parens reset precedence: (1+2)*3", () => {
    expect(parseOk("(1+2)*3")).toEqual(
      bin(
        "mul",
        "number",
        {
          node: "parens",
          outputSchema: "number",
          inner: bin("add", "number", num("1"), num("2")),
        },
        num("3")
      )
    );
  });

  it("tolerates whitespace between tokens", () => {
    expect(parseOk("1 + 2")).toEqual(bin("add", "number", num("1"), num("2")));
  });
});

describe("associativity", () => {
  it("left-assoc: 5-2-1 → (5-2)-1", () => {
    expect(parseOk("5-2-1")).toEqual(
      bin("sub", "number", bin("sub", "number", num("5"), num("2")), num("1"))
    );
  });

  it("left-assoc chains mixed same-level ops: 1-2+3 → (1-2)+3", () => {
    expect(parseOk("1-2+3")).toEqual(
      bin("add", "number", bin("sub", "number", num("1"), num("2")), num("3"))
    );
  });

  it("right-assoc: 2^3^2 → 2^(3^2)", () => {
    expect(parseOk("2^3^2")).toEqual(
      bin("pow", "number", num("2"), bin("pow", "number", num("3"), num("2")))
    );
  });

  it("left-assoc with precedence: 10-2*3-1 → (10-(2*3))-1", () => {
    expect(parseOk("10-2*3-1")).toEqual(
      bin(
        "sub",
        "number",
        bin("sub", "number", num("10"), bin("mul", "number", num("2"), num("3"))),
        num("1")
      )
    );
  });
});

describe("polymorphic nodes (union + sameAs + fromBinding)", () => {
  it("add derives its type per parse: numbers", () => {
    expect(parseOk("1+2")).toEqual(bin("add", "number", num("1"), num("2")));
  });

  it("add derives its type per parse: string concat", () => {
    expect(parseOk("'a'+'b'")).toEqual(bin("add", "string", str("a"), str("b")));
  });

  it("concat folds left-associatively", () => {
    expect(parseOk("'a'+'b'+'c'")).toEqual(
      bin("add", "string", bin("add", "string", str("a"), str("b")), str("c"))
    );
  });

  it("sameAs rejects mixed operand types: 1+'a'", () => {
    const error = parseErr("1+'a'");
    expect(error.code).toBe("TYPE_MISMATCH");
    expect(error.message).toContain("number");
    expect(error.message).toContain("string");
    expect(error.message).toContain("type of 'left'");
  });

  it("eq requires same-typed operands", () => {
    expect(parseOk("1==2")).toEqual(bin("eq", "boolean", num("1"), num("2")));
    const error = parseErr("1=='a'");
    expect(error.code).toBe("TYPE_MISMATCH");
  });

  it("parens are polymorphic via fromBinding", () => {
    expect(parseOk("('a')")).toEqual({
      node: "parens",
      outputSchema: "string",
      inner: str("a"),
    });
  });
});

describe("ternary", () => {
  it("parses with derived result type", () => {
    expect(parseOk("1==2 ? 3 : 4")).toEqual({
      node: "ternary",
      outputSchema: "number",
      cond: bin("eq", "boolean", num("1"), num("2")),
      then: num("3"),
      else: num("4"),
    });
  });

  it("derives string when branches are strings", () => {
    const ast = parseOk("1==1 ? 'yes' : 'no'") as { outputSchema: string };
    expect(ast.outputSchema).toBe("string");
  });

  it("chains right-associatively in the else branch", () => {
    const ast = parseOk("1==2 ? 1 : 2==2 ? 4 : 5");
    expect(ast).toMatchObject({ node: "ternary", else: { node: "ternary" } });
  });

  it("nests in the then branch via expr() reset", () => {
    const ast = parseOk("1==1 ? 1==2 ? 10 : 20 : 30");
    expect(ast).toMatchObject({ node: "ternary", then: { node: "ternary" } });
  });

  it("rejects a non-boolean condition", () => {
    const error = parseErr("1 ? 2 : 3");
    expect(error.code).toBe("UNEXPECTED_INPUT"); // 1 parses, '?' can't continue
    expect(error.position).toBe(2);
  });

  it("rejects disagreeing branches (sameAs)", () => {
    const error = parseErr("1==1 ? 1 : 'no'");
    expect(error.code).toBe("TYPE_MISMATCH");
    expect(error.message).toContain("type of 'then'");
  });
});

describe("member access (paths)", () => {
  it("parses dotted paths and resolves nested schemas", () => {
    expect(parseOk("values.password", formSchema)).toEqual(
      pathNode(["values", "password"], "string")
    );
  });

  it("parses the headline use case", () => {
    expect(
      parseOk("values.password == values.confirmPassword", formSchema)
    ).toEqual(
      bin(
        "eq",
        "boolean",
        pathNode(["values", "password"], "string"),
        pathNode(["values", "confirmPassword"], "string")
      )
    );
  });

  it("resolves unknown path segments to 'unknown'", () => {
    expect(parseOk("values.nope", formSchema)).toEqual(
      pathNode(["values", "nope"], "unknown")
    );
  });

  it("resolves a bare identifier for a nested record to its object type", () => {
    expect(parseOk("values", formSchema)).toEqual(
      pathNode(["values"], "{ confirmPassword: string, password: string }")
    );
  });

  it("does not traverse the prototype chain during type resolution", () => {
    expect(parseOk("constructor")).toEqual(pathNode(["constructor"], "unknown"));
    expect(parseOk("x.constructor", formSchema)).toEqual(
      pathNode(["x", "constructor"], "unknown")
    );
  });

  it("space BEFORE a dot ends the path", () => {
    // "values .password" → path is just ["values"], then " .password" is trailing
    const error = parseErr("values .password", formSchema);
    expect(error.code).toBe("UNEXPECTED_INPUT");
    expect(error.position).toBe(7);
  });

  it("space AFTER a dot fails the element", () => {
    const error = parseErr("values. password == 1", formSchema);
    expect(error.message).toMatch(/no whitespace after '\.'/);
  });

  it("dangling dot fails the element", () => {
    const error = parseErr("values.", formSchema);
    expect(error.code).toBe("PARSE_ERROR");
  });
});

describe("embedded binding references (scoped defs)", () => {
  // A def that EMBEDS a binding name resolves per-parse in a scope
  // extended with the parsed operand types (spike/union-defs).
  const num = defineNode({
    name: "num",
    precedence: 2,
    pattern: (p) => p.number(),
  });
  const str = defineNode({
    name: "str",
    precedence: 2,
    pattern: (p) => p.string(["'"]),
  });
  const nullLit = defineNode({
    name: "null",
    precedence: 2,
    pattern: (p) => p.constVal("null").result("null").eval(() => null),
  });

  /** postfix `x?`: resultType is a TEMPLATE over the operand. The operand
   *  constraint includes null so the node accepts its OWN output —
   *  chaining then exercises the fixed point. */
  const maybe = defineNode({
    name: "maybe",
    precedence: 1,
    pattern: (p) =>
      p
        .operand("number | string | null").as("v")
        .constVal("?")
        .result("v | null")
        .eval(({ v }) => v()),
  });

  /** `l ~ r` where r must be l-or-null: a TEMPLATE constraint */
  const pair = defineNode({
    name: "pair",
    precedence: 0,
    pattern: (p) =>
      p
        .operand("number | string").as("l")
        .constVal("~")
        .rest("l | null").as("r")
        .result("boolean")
        .eval(({ l, r }) => l() === r()),
  });

  /** object resultType embedding a reference */
  const box = defineNode({
    name: "box",
    precedence: 1,
    pattern: (p) =>
      p
        .operand("number | string").as("v")
        .constVal("!")
        .result({ value: "v | null" })
        .eval(({ v }) => ({ value: v() })),
  });

  const p = createParser([num, str, nullLit, maybe, pair, box] as const);

  it("resolves template resultTypes against the parsed operand", () => {
    const numbery = p.safeParse("1?", {});
    expect(numbery.success).toBe(true);
    if (numbery.success) expect(numbery.ast.outputSchema).toBe("number | null");

    const stringy = p.safeParse("'a'?", {});
    expect(stringy.success).toBe(true);
    if (stringy.success) expect(stringy.ast.outputSchema).toBe("string | null");
  });

  it("normalizes chained templates to a fixed point", () => {
    const chained = p.safeParse("1??", {});
    expect(chained.success).toBe(true);
    // (number | null) | null normalizes — no unbounded growth
    if (chained.success) expect(chained.ast.outputSchema).toBe("number | null");
  });

  it("checks template constraints by assignability", () => {
    expect(p.safeParse("1 ~ 2", {}).success).toBe(true);
    expect(p.safeParse("1 ~ null", {}).success).toBe(true); // null ⊆ number | null
    const bad = p.safeParse("1 ~ 'a'", {});
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.error.code).toBe("TYPE_MISMATCH");
  });

  it("resolves references inside object resultTypes", () => {
    const boxed = p.safeParse("1!", {});
    expect(boxed.success).toBe(true);
    if (boxed.success) {
      expect(boxed.ast.outputSchema).toBe("{ value: number | null }");
      expect(p.evaluateAst(boxed.ast as never, {})).toEqual({ value: 1 });
    }
  });

  it("template results feed downstream constraint checks", () => {
    // maybe's output (number | null) satisfies pair's template constraint
    // on the right ("l | null" with l: number)…
    expect(p.safeParse("1 ~ 2?", {}).success).toBe(true);
    // …but not pair's PLAIN left slot ("number | string": null ⊄ it)
    expect(p.safeParse("1? ~ 2", {}).success).toBe(false);
  });
});

describe("diagnostics", () => {
  it("reports expected tokens at end of input", () => {
    const error = parseErr("1+");
    expect(error.code).toBe("PARSE_ERROR");
    expect(error.position).toBe(2);
    expect(error.found).toBe("end of input");
    expect(error.expected).toContain("number");
  });

  it("reports unknown identifiers in constrained slots", () => {
    const error = parseErr("1+zz");
    expect(error.code).toBe("TYPE_MISMATCH");
    expect(error.position).toBe(2);
    expect(error.message).toContain("'zz' is not in the schema");
    expect(error.message).toContain("number");
  });

  it("reports unknown identifiers on the LHS of left-assoc operators", () => {
    const error = parseErr("zz+1");
    expect(error.code).toBe("TYPE_MISMATCH");
    expect(error.message).toContain("'zz' is not in the schema");
  });

  it("reports trailing input with expected continuations", () => {
    const error = parseErr("1+2 junk!!");
    expect(error.code).toBe("UNEXPECTED_INPUT");
    expect(error.position).toBe(4);
    expect(error.expected).toContain('"*"');
  });

  it("reports nothing-matched at position 0", () => {
    const error = parseErr("@invalid");
    expect(error.code).toBe("PARSE_ERROR");
    expect(error.position).toBe(0);
  });
});

describe("const-only atoms", () => {
  it("build a node carrying the declared resultType (no passthrough)", () => {
    // Covered in createParser.test.ts with a dedicated grammar; here we
    // just pin that parens' unnamed consts stay out of the AST.
    expect(parseOk("(1)")).toEqual({
      node: "parens",
      outputSchema: "number",
      inner: num("1"),
    });
  });
});

describe("overlapping() constraints (symmetric equality)", () => {
  const schema = { x: "string | number" } as const;

  it("accepts both operand orders when types overlap", () => {
    expect(parseOk("x == 1", schema)).toMatchObject({ node: "eq" });
    expect(parseOk("1 == x", schema)).toMatchObject({ node: "eq" });
  });

  it("still rejects disjoint operand types", () => {
    const error = parseErr("1 == 'a'");
    expect(error.code).toBe("TYPE_MISMATCH");
    expect(error.message).toContain("overlapping 'left'");
  });

  it("keeps refined-vs-base comparisons working via erasure", () => {
    expect(
      parseOk("age == 1", { age: "number > 0" })
    ).toMatchObject({ node: "eq", outputSchema: "boolean" });
  });
});
