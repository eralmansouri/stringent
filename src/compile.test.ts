/**
 * parser.compile() tests (Phase 6, D12/D13): rules as arktype Types.
 *
 * A boolean-output rule compiles to a PREDICATE Type (validate values,
 * reject with a field-attributed ArkErrors entry when the rule is false);
 * any other rule compiles to a MORPH Type (values in, evaluated result
 * out). Both are real arktype Types and therefore Standard Schemas.
 */

import { describe, expect, it } from "vitest";
import { type } from "arktype";
import { StringentParseError } from "./index.js";
import { fixtureParser as parser, formSchema } from "./__fixtures__/grammar.js";

const matching = {
  x: 0,
  values: { password: "hunter2", confirmPassword: "hunter2" },
};
const differing = {
  x: 0,
  values: { password: "hunter2", confirmPassword: "oops" },
};

describe("compile: predicate rules (boolean output)", () => {
  const rule = parser.compile(
    "values.password == values.confirmPassword",
    formSchema,
    { path: ["values", "confirmPassword"], message: "passwords to match" }
  );

  it("passes matching values through unchanged", () => {
    expect(rule(matching)).toEqual(matching);
  });

  it("rejects failing values with ArkErrors attributed to the given path", () => {
    const out = rule(differing);
    expect(out).toBeInstanceOf(type.errors);
    if (out instanceof type.errors) {
      expect(Object.keys(out.flatByPath)).toEqual(["values.confirmPassword"]);
      expect(out.summary).toContain("passwords to match");
      // actual: "" — the secret values must not leak into the message
      expect(out.summary).not.toContain("hunter2");
      expect(out.summary).not.toContain("oops");
    }
  });

  it("defaults to a root-path error naming the rule", () => {
    const bare = parser.compile(
      "values.password == values.confirmPassword",
      formSchema
    );
    const out = bare(differing);
    expect(out).toBeInstanceOf(type.errors);
    if (out instanceof type.errors) {
      expect(out.summary).toContain("values.password == values.confirmPassword");
    }
  });

  it("validates the values object BEFORE the rule runs", () => {
    const out = rule({ x: "nope", values: {} } as never);
    expect(out).toBeInstanceOf(type.errors);
  });

  it("enforces schema refinements even though rule typing is erased", () => {
    // typing-wise `age` is just a number inside the rule (erasure), but the
    // compiled Type still validates values against the full refined schema
    const positive = parser.compile("age == age", { age: "number > 0" });
    expect(positive({ age: 1 })).toEqual({ age: 1 });
    expect(positive({ age: -1 })).toBeInstanceOf(type.errors);
  });
});

describe("compile: morph rules (non-boolean output)", () => {
  it("evaluates to the rule's result", () => {
    const total = parser.compile("x * 2 + 1", { x: "number" });
    expect(total({ x: 20 })).toBe(41);
    const constant = parser.compile("1+2", {});
    expect(constant({})).toBe(3);
  });

  it("still validates the values object first", () => {
    const total = parser.compile("x * 2", { x: "number" });
    expect(total({ x: "no" } as never)).toBeInstanceOf(type.errors);
  });
});

describe("compile: ecosystem surface", () => {
  it("is a Standard Schema (v1)", () => {
    const rule = parser.compile(
      "values.password == values.confirmPassword",
      formSchema,
      { path: ["values", "confirmPassword"] }
    );
    const std = (rule as never as {
      "~standard": {
        version: number;
        vendor: string;
        validate: (v: unknown) =>
          | { value: unknown }
          | { issues: readonly { message: string; path?: readonly unknown[] }[] };
      };
    })["~standard"];
    expect(std.version).toBe(1);
    expect(std.vendor).toBe("arktype");

    const ok = std.validate(matching);
    expect(ok).toEqual({ value: matching });

    const bad = std.validate(differing);
    expect("issues" in bad && bad.issues.length).toBeGreaterThan(0);
    if ("issues" in bad) {
      // path is arktype's ReadonlyPath (an Array subclass with a `cache`
      // own property) — spread before comparing to a plain array
      expect([...(bad.issues[0].path ?? [])]).toEqual([
        "values",
        "confirmPassword",
      ]);
    }
  });

  it(".in exports the values contract as JSON Schema", () => {
    // morph rules: directly
    const total = parser.compile("x * 2", { x: "number" });
    expect(total.in.toJsonSchema()).toMatchObject({
      type: "object",
      properties: { x: { type: "number" } },
    });

    // predicate rules carry a predicate node in .in → needs the fallback
    const rule = parser.compile(
      "values.password == values.confirmPassword",
      formSchema
    );
    const js = rule.in.toJsonSchema({
      fallback: { predicate: (ctx) => ctx.base },
    });
    expect(js).toMatchObject({
      type: "object",
      properties: {
        values: {
          type: "object",
          properties: { confirmPassword: { type: "string" } },
        },
      },
    });
  });

  it("accepts dynamic rule strings and throws StringentParseError on bad ones", () => {
    const dynamic: string = ["x", "==", "1"].join(" ");
    const rule = parser.compile(dynamic, { x: "number" });
    expect(rule({ x: 1 })).toEqual({ x: 1 });
    expect(rule({ x: 2 })).toBeInstanceOf(type.errors);

    expect(() => {
      parser.compile("x ==" as string, { x: "number" });
    }).toThrow(StringentParseError);
  });
});
