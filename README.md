# Stringent

[![npm](https://img.shields.io/npm/v/stringent)](https://www.npmjs.com/package/stringent)
[![CI](https://github.com/eralmansouri/stringent/actions/workflows/ci.yml/badge.svg)](https://github.com/eralmansouri/stringent/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

A type-safe expression parser and evaluator for TypeScript. One grammar
definition drives two engines: a **type-level parser** (expressions in string
literals are validated and fully typed at compile time) and a **runtime
parser** (dynamic strings get structured errors and evaluation).

```typescript
const result = parser.evaluate(
  "values.password == values.confirmPassword",
  { values: { password: "string", confirmPassword: "string" } }, // schema
  { values: { password: "hunter2", confirmPassword: "hunter2" } } // values
);
//    ^? boolean (= true)
```

**📚 Documentation:** guides, a live playground, and the API reference live at
**[eralmansouri.github.io/stringent](https://eralmansouri.github.io/stringent/)**.
The code examples there are compiled against the real library on every docs
build — hover them to see the actual inferred types.

> **Note**
> Pre-1.0: the API is stabilizing but may still change between minor versions.
> See [DESIGN.md](./DESIGN.md) for the architecture and its rationale.

## Why stringent

- **Compile-time validation** — `parse()` only accepts string literals that
  fully parse against your grammar. Syntax errors, operand type mismatches,
  and even typos in schema leaves are compile errors, and valid expressions
  get an exactly inferred AST and result type.
- **Structured runtime errors** — `safeParse()` never throws for input. You
  get an error code (`PARSE_ERROR` / `TYPE_MISMATCH` / `UNEXPECTED_INPUT`), a
  0-based position, and the tokens that would have been valid there.
- **Polymorphic grammars** — union constraints, `sameAs()` and `fromBinding()`
  give you overloaded operators without per-type node variants: one `add` node
  handles `number+number → number` and `string+string → string`.
- **Secure by default** — expressions are untrusted input. All identifier and
  path lookups are own-property only; `__proto__` and `constructor` never
  resolve to prototype internals.

## Installation

```bash
npm install stringent   # or: pnpm add stringent
```

ESM-only, with one small dependency.

## Quickstart

Each `defineNode` call declares one grammar rule: a pattern of elements, a
precedence, and (optionally) a result type and evaluation function.

```typescript
import {
  defineNode, number, path, lhs, rhs, constVal,
  sameAs, fromBinding, createParser,
} from "stringent";

// Atoms — single-element passthrough patterns need no resultType
const numberLit = defineNode({ name: "num", pattern: [number()], precedence: "atom" });
const variable  = defineNode({ name: "var", pattern: [path()], precedence: "atom" });

// ONE overloaded add: number+number → number, string+string → string
const add = defineNode({
  name: "add",
  pattern: [lhs(["number", "string"]).as("left"), constVal("+"), rhs(sameAs("left")).as("right")],
  precedence: 2,            // lower = binds looser
  associativity: "left",    // 1+2+3 parses as (1+2)+3
  resultType: fromBinding("left"),
  eval: ({ left, right }) => (left as any) + (right as any),
});

const mul = defineNode({
  name: "mul",
  pattern: [lhs("number").as("left"), constVal("*"), rhs("number").as("right")],
  precedence: 3,            // higher = binds tighter
  associativity: "left",
  resultType: "number",
  eval: ({ left, right }) => left * right,
});

const parser = createParser([numberLit, variable, add, mul] as const);
```

**String literals** are checked by the type engine — invalid expressions
don't compile, and result types are inferred through the grammar:

```typescript
const [ast] = parser.parse("1+2*3", {});  // AST type fully inferred
parser.parse("1+", {});                   // ✗ compile error
parser.parse("1+'a'", {});                // ✗ compile error: operand types disagree

parser.evaluate("1+2*3", {}, {});                   // 7, typed number
parser.evaluate("x*2", { x: "number" }, { x: 21 }); // 42, typed number
```

**Dynamic strings** go through `safeParse()`, which returns structured errors
instead of throwing:

```typescript
const result = parser.safeParse(userInput, { x: "number" });
if (result.success) {
  parser.evaluateAst(result.ast, { x: 21 });
} else {
  result.error.message;  // "Expected a number expression at position 2, got string"
  result.error.position; // 0-based offset into the input
  result.error.expected; // tokens that would have been valid there
}
```

There's more — quoted strings, parentheses, lazy short-circuiting ternaries,
nested schemas with dotted-path member access (`values.password`), and
construction-time grammar validation:

- [Getting started](https://eralmansouri.github.io/stringent/guides/getting-started/)
  — the full quickstart with hover-able types
- [Defining a grammar](https://eralmansouri.github.io/stringent/guides/defining-a-grammar/)
  — pattern elements, precedence, associativity
- [Schemas & types](https://eralmansouri.github.io/stringent/guides/schemas-and-types/)
  — the type vocabulary and polymorphic nodes
- [Error handling](https://eralmansouri.github.io/stringent/guides/error-handling/)
  — the error model in detail
- [Playground](https://eralmansouri.github.io/stringent/playground/)
  — try the runtime engine in your browser

## Development

```bash
pnpm install
pnpm typecheck   # includes type-level tests (src/**/*.typetest.ts)
pnpm test        # vitest runtime tests
pnpm build
pnpm check:package  # publint + arethetypeswrong
```

The type-level and runtime engines are hand-mirrored
(`src/parse/index.ts` ↔ `src/runtime/parser.ts`); the parity assertions in
`src/parser.test.ts` and `src/types.typetest.ts` pin both to the same
behavior — extend both when adding grammar features. See
[DESIGN.md](./DESIGN.md) for the full architecture.

## License

MIT
