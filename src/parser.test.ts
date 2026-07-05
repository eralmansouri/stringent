/**
 * Runtime parser tests: AST shapes, precedence, associativity, paths,
 * whitespace rules and diagnostics.
 *
 * The expected AST objects here are mirrored by type-level assertions in
 * src/types.typetest.ts — together they pin both engines to the same
 * behavior (parity suite).
 */

import { describe, expect, it } from "vitest";
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

  it("resolves a bare identifier for a nested record to 'unknown'", () => {
    expect(parseOk("values", formSchema)).toEqual(pathNode(["values"], "unknown"));
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

describe("diagnostics", () => {
  it("reports expected tokens at end of input", () => {
    const error = parseErr("1+");
    expect(error.code).toBe("PARSE_ERROR");
    expect(error.position).toBe(2);
    expect(error.found).toBe("end of input");
    expect(error.expected).toContain("number");
  });

  it("reports type mismatches with schema hint", () => {
    const error = parseErr("1+zz");
    expect(error.code).toBe("TYPE_MISMATCH");
    expect(error.position).toBe(2);
    expect(error.message).toContain("'zz' is not in the schema");
    expect(error.message).toContain("number");
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

  it("reports constraint mismatch for wrongly-typed operands", () => {
    const error = parseErr("1+'a'");
    expect(error.code).toBe("TYPE_MISMATCH");
    expect(error.message).toContain("number");
    expect(error.message).toContain("string");
  });
});

describe("const node parity", () => {
  it("parses parens (unnamed const elements are dropped from the AST)", () => {
    expect(parseOk("(1)")).toEqual({
      node: "parens",
      outputSchema: "number",
      inner: num("1"),
    });
  });
});
