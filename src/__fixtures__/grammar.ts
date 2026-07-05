/**
 * Shared fixture grammar for tests.
 *
 * Covers every pattern element and both associativities:
 * - atoms: number, string, variable (path), parens
 * - prec 0: eq (right-associative, unconstrained operands)
 * - prec 1: add, sub (left-associative)
 * - prec 2: mul, div (left-associative)
 * - prec 3: pow (right-associative)
 */

import {
  defineNode,
  number,
  string,
  path,
  lhs,
  rhs,
  expr,
  constVal,
  createParser,
} from "../index.js";

export const numberLit = defineNode({
  name: "number",
  pattern: [number()],
  precedence: "atom",
  resultType: "number",
});

export const stringLit = defineNode({
  name: "string",
  pattern: [string(['"', "'"])],
  precedence: "atom",
  resultType: "string",
});

export const variable = defineNode({
  name: "var",
  pattern: [path()],
  precedence: "atom",
  resultType: "unknown",
});

export const parens = defineNode({
  name: "parens",
  pattern: [constVal("("), expr("number").as("inner"), constVal(")")],
  precedence: "atom",
  resultType: "number",
  eval: ({ inner }) => inner,
});

export const eq = defineNode({
  name: "eq",
  pattern: [lhs().as("left"), constVal("=="), rhs().as("right")],
  precedence: 0,
  resultType: "boolean",
  eval: ({ left, right }) => left === right,
});

export const add = defineNode({
  name: "add",
  pattern: [lhs("number").as("left"), constVal("+"), rhs("number").as("right")],
  precedence: 1,
  associativity: "left",
  resultType: "number",
  eval: ({ left, right }) => left + right,
});

export const sub = defineNode({
  name: "sub",
  pattern: [lhs("number").as("left"), constVal("-"), rhs("number").as("right")],
  precedence: 1,
  associativity: "left",
  resultType: "number",
  eval: ({ left, right }) => left - right,
});

export const mul = defineNode({
  name: "mul",
  pattern: [lhs("number").as("left"), constVal("*"), rhs("number").as("right")],
  precedence: 2,
  associativity: "left",
  resultType: "number",
  eval: ({ left, right }) => left * right,
});

export const div = defineNode({
  name: "div",
  pattern: [lhs("number").as("left"), constVal("/"), rhs("number").as("right")],
  precedence: 2,
  associativity: "left",
  resultType: "number",
  eval: ({ left, right }) => left / right,
});

export const pow = defineNode({
  name: "pow",
  pattern: [lhs("number").as("left"), constVal("^"), rhs("number").as("right")],
  precedence: 3,
  resultType: "number", // right-associative (default)
  eval: ({ left, right }) => left ** right,
});

export const fixtureNodes = [
  numberLit,
  stringLit,
  variable,
  parens,
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
