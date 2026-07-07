/**
 * Benchmarks (vitest bench): the shapes that matter in production —
 * dynamic-string parsing, evaluation of pre-parsed ASTs (the form-rule
 * hot path), compiled-rule validation, and parser construction.
 *
 * Run with `pnpm bench`. Compare against the same shapes when touching
 * the runtime parser, the arktype adapter caches, or the evaluator.
 */

import { bench, describe } from "vitest";
import { createParser } from "./index.js";
import {
  fixtureNodes,
  fixtureParser as parser,
  formSchema,
} from "./__fixtures__/grammar.js";

const matching = {
  x: 0,
  values: { password: "hunter2", confirmPassword: "hunter2" },
};
const differing = {
  x: 0,
  values: { password: "hunter2", confirmPassword: "oops" },
};

describe("safeParse (dynamic strings)", () => {
  bench("simple arithmetic: 1+2*3", () => {
    parser.safeParse("1+2*3", {});
  });

  bench("headline rule: values.password == values.confirmPassword", () => {
    parser.safeParse("values.password == values.confirmPassword", formSchema);
  });

  bench("nested + ternary: (1+2)*3 == 9 ? 'a' : 'b'", () => {
    parser.safeParse("(1+2)*3 == 9 ? 'a' : 'b'", {});
  });

  bench("left chain: 1+2+3+4+5+6+7+8+9+10", () => {
    parser.safeParse("1+2+3+4+5+6+7+8+9+10", {});
  });

  bench("failure with diagnostics: 1 + 'a'", () => {
    parser.safeParse("1 + 'a'", {});
  });
});

describe("evaluate", () => {
  const rule = parser.safeParse(
    "values.password == values.confirmPassword",
    formSchema
  );
  if (!rule.success) throw new Error("bench setup failed");
  const devParser = parser;
  const prodParser = createParser(fixtureNodes, { dev: false });

  bench("evaluateAst headline rule (dev assertions on)", () => {
    devParser.evaluateAst(rule.ast, matching);
  });

  bench("evaluateAst headline rule (dev: false)", () => {
    prodParser.evaluateAst(rule.ast, matching);
  });

  bench("parse + validate + evaluate: evaluate()", () => {
    parser.evaluate("x + 1", { x: "number" }, { x: 41 });
  });
});

describe("compiled rules (form-validation hot path)", () => {
  const rule = parser.compile(
    "values.password == values.confirmPassword",
    formSchema,
    { path: ["values", "confirmPassword"] }
  );

  bench("rule(values) — pass", () => {
    rule(matching);
  });

  bench("rule(values) — fail (ArkErrors)", () => {
    rule(differing);
  });
});

describe("construction", () => {
  bench("createParser(fixtureNodes) — 14 nodes, 6 levels", () => {
    createParser(fixtureNodes);
  });
});
