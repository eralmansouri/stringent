/**
 * Shared fixture grammar for tests.
 *
 * Exercises the full v2 design: passthrough atoms without resultType, a
 * polymorphic parens rule (binding-reference resultType), a short-
 * circuiting ternary (binding-reference constraint + resultType; evaluation
 * is uniformly lazy, so untaken branches never run), same-type equality,
 * an overloaded add (union constraint + binding reference = numeric add
 * AND string concat), numeric LEFT-associative operators (operand(...)
 * tails), and a RIGHT-associative pow (rest(...) tail).
 *
 * Levels: ternary(0) < eq(1) < add,sub(2) < mul,div(3) < pow(4) < leaf(5)
 */

import { match } from "arktype";
import { defineNode, overlapping, createParser } from "../index.js";

export const numberLit = defineNode({
  name: "num",
  precedence: 5,
  pattern: (p) => p.number(),
});

export const stringLit = defineNode({
  name: "str",
  precedence: 5,
  pattern: (p) => p.string(['"', "'"]),
});

/** Keyword literals are ordinary const-pattern nodes: identifier-like
 *  const values match whole identifiers only (word-boundary rule), so
 *  `nullable` never matches `constVal("null")`. Both booleans live in ONE
 *  node via const ALTERNATION — the named element binds the MATCHED text. */
export const boolLit = defineNode({
  name: "bool",
  precedence: 5,
  pattern: (p) =>
    p
      .constVal("true", "false").as("word")
      .result("boolean")
      .eval(({ word }) => word() === "true"),
});

export const nullLit = defineNode({
  name: "null",
  precedence: 5,
  pattern: (p) => p.constVal("null").result("null").eval(() => null),
});

export const undefinedLit = defineNode({
  name: "undefined",
  precedence: 5,
  pattern: (p) =>
    p
      .constVal("undefined")
      .result("undefined")
      .eval(() => undefined),
});

/** Keyword nodes MUST come before variable in the level: alternation is
 *  ordered, and `true` would otherwise parse as a path/identifier. */
export const variable = defineNode({
  name: "var",
  precedence: 5,
  pattern: (p) => p.path(),
});

/** Polymorphic parenthesization: type = whatever is inside */
export const parens = defineNode({
  name: "parens",
  precedence: 5,
  pattern: (p) =>
    p
      .constVal("(")
      .expr().as("inner")
      .constVal(")")
      .result("inner")
      .eval(({ inner }) => inner()),
});

/** Polymorphic short-circuiting ternary: branches must agree, result derives */
export const ternary = defineNode({
  name: "ternary",
  precedence: 0,
  pattern: (p) =>
    p
      .operand("boolean").as("cond")
      .constVal("?")
      .expr().as("then")
      .constVal(":")
      .rest("then").as("else")
      .result("then")
      .eval(({ cond, then, else: alt }) => (cond() ? then() : alt())),
});

/** Overlap-typed equality: 1 == 'a' is a parse-time type error, but
 *  operand order never matters (x == 1 and 1 == x both parse). */
export const eq = defineNode({
  name: "eq",
  precedence: 1,
  pattern: (p) =>
    p
      .operand().as("left")
      .constVal("==")
      .rest(overlapping("left")).as("right")
      .result("boolean")
      .eval(({ left, right }) => left() === right()),
});

/** Overloaded add: number+number → number, string+string → string.
 *  operand(...) tail → the level folds left-associatively.
 *
 *  Eval bindings are FLAT: { left: string | number; right: string | number }
 *  (the parser guarantees the sides are assignable per-parse, but the
 *  static type does not correlate them; asserted against
 *  InferEvaluatedBindings in types.typetest.ts). arktype's match is the
 *  idiomatic polymorphic eval: one case per accepted combination,
 *  .default("assert") rejects the rest at runtime. */
const addImpl = match
  .in<{ left: string | number; right: string | number }>()
  .case({ left: "number", right: "number" }, (b) => b.left + b.right)
  .case({ left: "string", right: "string" }, (b) => b.left + b.right)
  .default("assert");

export const add = defineNode({
  name: "add",
  precedence: 2,
  pattern: (p) =>
    p
      .operand("number | string").as("left")
      .constVal("+")
      .operand("left").as("right")
      .result("left")
      .eval((b) => addImpl({ left: b.left(), right: b.right() })),
});

export const sub = defineNode({
  name: "sub",
  precedence: 2,
  pattern: (p) =>
    p
      .operand("number").as("left")
      .constVal("-")
      .operand("number").as("right")
      .result("number")
      .eval(({ left, right }) => left() - right()),
});

export const mul = defineNode({
  name: "mul",
  precedence: 3,
  pattern: (p) =>
    p
      .operand("number").as("left")
      .constVal("*")
      .operand("number").as("right")
      .result("number")
      .eval(({ left, right }) => left() * right()),
});

export const div = defineNode({
  name: "div",
  precedence: 3,
  pattern: (p) =>
    p
      .operand("number").as("left")
      .constVal("/")
      .operand("number").as("right")
      .result("number")
      .eval(({ left, right }) => left() / right()),
});

/** rest(...) tail → right-associative: 2^3^2 = 2^(3^2). Associativity is
 *  derived from the tail's parse LEVEL — there is no associativity
 *  property; see "Why there is no associativity property" in
 *  docs/guides/defining-a-grammar (history + the 3-vs-7 demo, pinned in
 *  design-claims.test.ts). */
export const pow = defineNode({
  name: "pow",
  precedence: 4,
  pattern: (p) =>
    p
      .operand("number").as("left")
      .constVal("^")
      .rest("number").as("right")
      .result("number")
      .eval(({ left, right }) => left() ** right()),
});

export const fixtureNodes = [
  numberLit,
  stringLit,
  boolLit,
  nullLit,
  undefinedLit,
  variable,
  parens,
  ternary,
  eq,
  add,
  sub,
  mul,
  div,
  pow,
] as const;

export const fixtureParser = createParser(fixtureNodes);

/** Nested schema used by path tests */
export const formSchema = {
  x: "number",
  values: { password: "string", confirmPassword: "string" },
} as const;
