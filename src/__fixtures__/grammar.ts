/**
 * Shared fixture grammar for tests.
 *
 * Exercises the full v2 design: passthrough atoms without resultType, a
 * polymorphic parens rule (binding-reference resultType), a lazy
 * short-circuiting ternary (binding-reference constraint + resultType),
 * same-type equality, an overloaded add (union constraint + binding
 * reference = numeric add AND string concat), numeric LEFT-associative
 * operators (lhs(...) tails), and a RIGHT-associative pow (rhs(...) tail).
 *
 * Levels: ternary(0) < eq(1) < add,sub(2) < mul,div(3) < pow(4) < leaf(5)
 */

import { match } from "arktype";
import {
  defineNode,
  number,
  string,
  path,
  lhs,
  rhs,
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
  eval: ({ inner }) => inner,
});

/** Polymorphic short-circuiting ternary: branches must agree, result derives */
export const ternary = defineNode({
  name: "ternary",
  pattern: [
    lhs("boolean").as("cond"),
    constVal("?"),
    expr().as("then"),
    constVal(":"),
    rhs("then").as("else"),
  ],
  precedence: 0,
  resultType: "then",
  lazy: true,
  eval: ({ cond, then, else: alt }) => (cond() ? then() : alt()),
});

/** Overlap-typed equality: 1 == 'a' is a parse-time type error, but
 *  operand order never matters (x == 1 and 1 == x both parse). */
export const eq = defineNode({
  name: "eq",
  pattern: [lhs().as("left"), constVal("=="), rhs(overlapping("left")).as("right")],
  precedence: 1,
  resultType: "boolean",
  eval: ({ left, right }) => left === right,
});

/** Overloaded add: number+number → number, string+string → string.
 *  lhs(...) tail → the level folds left-associatively.
 *
 *  The binding reference correlates the operands, so eval's parameter is
 *  the distributed union { left: number; right: number } | { left: string;
 *  right: string }. TS can't narrow sibling properties through a typeof
 *  check, so the idiomatic polymorphic eval is arktype's match: one case
 *  per union branch, no casts. */
const addPattern = [
  lhs("number | string").as("left"),
  constVal("+"),
  lhs("left").as("right"),
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
  // wrap the matcher: eval is CALLED as (bindings, runtimeValues), and a
  // bare arktype matcher would treat the second argument as its internal
  // traversal context and crash
  eval: (b) => addImpl(b),
});

export const sub = defineNode({
  name: "sub",
  pattern: [lhs("number").as("left"), constVal("-"), lhs("number").as("right")],
  precedence: 2,
  resultType: "number",
  eval: ({ left, right }) => left - right,
});

export const mul = defineNode({
  name: "mul",
  pattern: [lhs("number").as("left"), constVal("*"), lhs("number").as("right")],
  precedence: 3,
  resultType: "number",
  eval: ({ left, right }) => left * right,
});

export const div = defineNode({
  name: "div",
  pattern: [lhs("number").as("left"), constVal("/"), lhs("number").as("right")],
  precedence: 3,
  resultType: "number",
  eval: ({ left, right }) => left / right,
});

/** rhs(...) tail → right-associative: 2^3^2 = 2^(3^2) */
export const pow = defineNode({
  name: "pow",
  pattern: [lhs("number").as("left"), constVal("^"), rhs("number").as("right")],
  precedence: 4,
  resultType: "number",
  eval: ({ left, right }) => left ** right,
});

export const fixtureNodes = [
  numberLit,
  stringLit,
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
