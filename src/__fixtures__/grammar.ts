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
import {
  defineNode,
  number,
  string,
  boolean,
  nullVal,
  undefinedVal,
  path,
  operand,
  rest,
  expr,
  constVal,
  overlapping,
  createParser,
  type InferEvaluatedBindings,
} from "../index.js";

export const numberLit = defineNode({
  name: "num",
  pattern: [number()],
  precedence: 5,
});

export const stringLit = defineNode({
  name: "str",
  pattern: [string(['"', "'"])],
  precedence: 5,
});

export const boolLit = defineNode({
  name: "bool",
  pattern: [boolean()],
  precedence: 5,
});

export const nullLit = defineNode({
  name: "null",
  pattern: [nullVal()],
  precedence: 5,
});

export const undefinedLit = defineNode({
  name: "undefined",
  pattern: [undefinedVal()],
  precedence: 5,
});

/** Keyword nodes MUST come before variable in the level: alternation is
 *  ordered, and `true` would otherwise parse as a path/identifier. */
export const variable = defineNode({
  name: "var",
  pattern: [path()],
  precedence: 5,
});

/** Polymorphic parenthesization: type = whatever is inside */
export const parens = defineNode({
  name: "parens",
  pattern: [constVal("("), expr().as("inner"), constVal(")")],
  precedence: 5,
  resultType: "inner",
  eval: ({ inner }) => inner(),
});

/** Polymorphic short-circuiting ternary: branches must agree, result derives */
export const ternary = defineNode({
  name: "ternary",
  pattern: [
    operand("boolean").as("cond"),
    constVal("?"),
    expr().as("then"),
    constVal(":"),
    rest("then").as("else"),
  ],
  precedence: 0,
  resultType: "then",
  eval: ({ cond, then, else: alt }) => (cond() ? then() : alt()),
});

/** Overlap-typed equality: 1 == 'a' is a parse-time type error, but
 *  operand order never matters (x == 1 and 1 == x both parse). */
export const eq = defineNode({
  name: "eq",
  pattern: [operand().as("left"), constVal("=="), rest(overlapping("left")).as("right")],
  precedence: 1,
  resultType: "boolean",
  eval: ({ left, right }) => left() === right(),
});

/** Overloaded add: number+number → number, string+string → string.
 *  operand(...) tail → the level folds left-associatively.
 *
 *  Eval bindings are FLAT: { left: string | number; right: string | number }
 *  (the parser guarantees the sides are assignable per-parse, but the
 *  static type does not correlate them). arktype's match is the idiomatic
 *  polymorphic eval: one case per accepted combination, .default("assert")
 *  rejects the rest at runtime. */
const addPattern = [
  operand("number | string").as("left"),
  constVal("+"),
  operand("left").as("right"),
] as const;

const addImpl = match
  .in<InferEvaluatedBindings<typeof addPattern>>()
  .case({ left: "number", right: "number" }, (b) => b.left + b.right)
  .case({ left: "string", right: "string" }, (b) => b.left + b.right)
  .default("assert");

export const add = defineNode({
  name: "add",
  pattern: addPattern,
  precedence: 2,
  resultType: "left",
  eval: (b) => addImpl({ left: b.left(), right: b.right() }),
});

export const sub = defineNode({
  name: "sub",
  pattern: [operand("number").as("left"), constVal("-"), operand("number").as("right")],
  precedence: 2,
  resultType: "number",
  eval: ({ left, right }) => left() - right(),
});

export const mul = defineNode({
  name: "mul",
  pattern: [operand("number").as("left"), constVal("*"), operand("number").as("right")],
  precedence: 3,
  resultType: "number",
  eval: ({ left, right }) => left() * right(),
});

export const div = defineNode({
  name: "div",
  pattern: [operand("number").as("left"), constVal("/"), operand("number").as("right")],
  precedence: 3,
  resultType: "number",
  eval: ({ left, right }) => left() / right(),
});

/** rest(...) tail → right-associative: 2^3^2 = 2^(3^2) */
export const pow = defineNode({
  name: "pow",
  pattern: [operand("number").as("left"), constVal("^"), rest("number").as("right")],
  precedence: 4,
  resultType: "number",
  eval: ({ left, right }) => left() ** right(),
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
