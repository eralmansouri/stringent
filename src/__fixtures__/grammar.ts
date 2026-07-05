/**
 * Shared fixture grammar for tests.
 *
 * Exercises the full design: passthrough atoms without resultType,
 * a polymorphic parens rule (fromBinding), a lazy short-circuiting ternary
 * (sameAs + fromBinding), same-type equality, an overloaded add
 * (union constraint + sameAs + fromBinding = numeric add AND string
 * concat), numeric left-associative operators, and a right-associative pow.
 *
 * Levels: ternary(0) < eq(1) < add,sub(2) < mul,div(3) < pow(4) < atoms
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
  sameAs,
  fromBinding,
  createParser,
} from "../index.js";

export const numberLit = defineNode({
  name: "num",
  pattern: [number()],
  precedence: "atom",
});

export const stringLit = defineNode({
  name: "str",
  pattern: [string(['"', "'"])],
  precedence: "atom",
});

export const variable = defineNode({
  name: "var",
  pattern: [path()],
  precedence: "atom",
});

/** Polymorphic parenthesization: type = whatever is inside */
export const parens = defineNode({
  name: "parens",
  pattern: [constVal("("), expr().as("inner"), constVal(")")],
  precedence: "atom",
  resultType: fromBinding("inner"),
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
    rhs(sameAs("then")).as("else"),
  ],
  precedence: 0,
  resultType: fromBinding("then"),
  lazy: true,
  eval: ({ cond, then, else: alt }) => (cond() ? then() : alt()),
});

/** Same-type equality: 1 == 'a' is a parse-time type error */
export const eq = defineNode({
  name: "eq",
  pattern: [lhs().as("left"), constVal("=="), rhs(sameAs("left")).as("right")],
  precedence: 1,
  resultType: "boolean",
  eval: ({ left, right }) => left === right,
});

/** Overloaded add: number+number → number, string+string → string */
export const add = defineNode({
  name: "add",
  pattern: [
    lhs(["number", "string"]).as("left"),
    constVal("+"),
    rhs(sameAs("left")).as("right"),
  ],
  precedence: 2,
  associativity: "left",
  resultType: fromBinding("left"),
  eval: ({ left, right }) => (left as any) + (right as any),
});

export const sub = defineNode({
  name: "sub",
  pattern: [lhs("number").as("left"), constVal("-"), rhs("number").as("right")],
  precedence: 2,
  associativity: "left",
  resultType: "number",
  eval: ({ left, right }) => left - right,
});

export const mul = defineNode({
  name: "mul",
  pattern: [lhs("number").as("left"), constVal("*"), rhs("number").as("right")],
  precedence: 3,
  associativity: "left",
  resultType: "number",
  eval: ({ left, right }) => left * right,
});

export const div = defineNode({
  name: "div",
  pattern: [lhs("number").as("left"), constVal("/"), rhs("number").as("right")],
  precedence: 3,
  associativity: "left",
  resultType: "number",
  eval: ({ left, right }) => left / right,
});

export const pow = defineNode({
  name: "pow",
  pattern: [lhs("number").as("left"), constVal("^"), rhs("number").as("right")],
  precedence: 4,
  resultType: "number", // right-associative (default)
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

// =============================================================================
// Prefix / boolean-literal mini-grammar
//
// Kept separate from fixtureNodes so the grammar-shape and diagnostics
// assertions over the main fixture stay stable. Exercises: const-only atoms
// (no bindings, static resultType) and a leading-const prefix operator.
// =============================================================================

export const boolTrue = defineNode({
  name: "true",
  pattern: [constVal("true")],
  precedence: "atom",
  resultType: "boolean",
  eval: () => true,
});

export const boolFalse = defineNode({
  name: "false",
  pattern: [constVal("false")],
  precedence: "atom",
  resultType: "boolean",
  eval: () => false,
});

/** Prefix boolean negation: a pattern that starts with a const. */
export const not = defineNode({
  name: "not",
  pattern: [constVal("!"), rhs("boolean").as("value")],
  precedence: 2,
  resultType: "boolean",
  eval: ({ value }) => !value,
});

export const and = defineNode({
  name: "and",
  pattern: [lhs("boolean").as("left"), constVal("&&"), rhs("boolean").as("right")],
  precedence: 1,
  associativity: "left",
  resultType: "boolean",
  lazy: true,
  eval: ({ left, right }) => left() && right(),
});

export const prefixNodes = [boolTrue, boolFalse, variable, not, and] as const;

export const prefixParser = createParser(prefixNodes);
