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
> Pre-1.0: the API is stabilizing but may still change between releases.
> See [DESIGN.md](./DESIGN.md) for the architecture and its rationale.

## Why stringent

- **Compile-time validation** — `parse()` only accepts string literals that
  fully parse against your grammar. Syntax errors, operand type mismatches,
  and even typos in schema leaves are compile errors, and valid expressions
  get an exactly inferred AST and result type.
- **Real type expressions** — constraints, result types, and schemas are
  [arktype](https://arktype.io) definitions (`"string | number"`,
  `"number > 0"`, `"string.email"`), and constraint matching is
  **assignability**, not name equality. Binding names are automatically in
  scope: `rest("left")` means "assignable to whatever `left` parsed as".
- **Structured runtime errors** — `safeParse()` never throws for input. You
  get an error code (`PARSE_ERROR` / `TYPE_MISMATCH` / `UNEXPECTED_INPUT`), a
  0-based position, and the tokens that would have been valid there.
- **Rules as Standard Schemas** — `parser.compile()` turns a rule into a real
  arktype `Type`: cross-field predicate rules validate a values object with
  field-attributed `ArkErrors`, so a rule drops straight into
  react-hook-form, tRPC, or hono.
- **Secure by default** — expressions are untrusted input. All identifier and
  path lookups are own-property only; `__proto__` and `constructor` never
  resolve to prototype internals. Failure messages never include runtime
  values.

## Installation

```bash
npm install stringent   # or: pnpm add stringent
```

ESM-only. Depends on [arktype](https://arktype.io) (the type engine) and
[parsebox](https://github.com/sinclairzx81/parsebox) (tokenizers).

## Quickstart

Each `defineNode` call declares one grammar rule: a pattern of elements, a
precedence, and (usually) a result type and evaluation function. Two element
roles place subexpressions: `operand()` parses at the next tighter precedence
level, `rest()` parses at the current level — and the *tail* element's role
is what makes a level left- or right-associative (an `operand()` tail folds
left; a `rest()` tail recurses right).

```typescript
import {
  defineNode, number, path, operand, rest, constVal, createParser,
} from "stringent";

// Leaf nodes live at the HIGHEST precedence level.
// Single-element passthrough patterns take no resultType.
const numberLit = defineNode({ name: "num", pattern: [number()], precedence: 4 });
const variable  = defineNode({ name: "var", pattern: [path()], precedence: 4 });

// ONE overloaded add: number+number → number, string+string → string.
// "number | string" is an arktype def; "left" is a binding reference.
// The operand() tail makes the level LEFT-associative: 1+2+3 = (1+2)+3.
const add = defineNode({
  name: "add",
  pattern: [operand("number | string").as("left"), constVal("+"), operand("left").as("right")],
  precedence: 2,            // lower = binds looser
  resultType: "left",       // derived: whatever `left` parsed as
  eval: (b) => (typeof b.left === "string" ? `${b.left}${b.right}` : Number(b.left) + Number(b.right)),
});

// A rest() tail makes a level RIGHT-associative: 2^3^2 = 2^(3^2)
const pow = defineNode({
  name: "pow",
  pattern: [operand("number").as("left"), constVal("^"), rest("number").as("right")],
  precedence: 3,            // higher = binds tighter
  resultType: "number",
  eval: ({ left, right }) => left ** right,
});

const parser = createParser([numberLit, variable, add, pow] as const);
```

**String literals** are checked by the type engine — invalid expressions
don't compile, and result types are inferred through the grammar:

```typescript
const [ast] = parser.parse("1+2^3", {});  // AST type fully inferred
parser.parse("1+", {});                   // ✗ compile error
parser.parse("1+'a'", {});                // ✗ compile error: 'a' ⊄ number | string… and 'a' ⊄ left

parser.evaluate("1+2^3", {}, {});                   // 9, typed number
parser.evaluate("x+1", { x: "number" }, { x: 41 }); // 42, typed number
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

**Rules become arktype Types** (and therefore Standard Schemas) with
`compile()` — a boolean rule validates values and attributes failures to a
field; any other rule maps values to its result:

```typescript
const rule = parser.compile(
  "values.password == values.confirmPassword",
  { values: { password: "string", confirmPassword: "string" } },
  { path: ["values", "confirmPassword"], message: "passwords to match" }
);
rule({ values: { password: "a", confirmPassword: "a" } }); // → the values object
rule({ values: { password: "a", confirmPassword: "b" } }); // → ArkErrors, flatByPath
// rule is a Standard Schema — pass it to react-hook-form, tRPC, hono, …
```

There's more — quoted strings with escapes, `true`/`false`/`null`/`undefined`
literals, parentheses, lazy short-circuiting ternaries, polymorphic evals via
arktype `match` over correlated bindings, nested schemas with dotted-path
member access (`values.password`), and construction-time grammar validation:

- [Getting started](https://eralmansouri.github.io/stringent/guides/getting-started/)
  — the full quickstart with hover-able types
- [Defining a grammar](https://eralmansouri.github.io/stringent/guides/defining-a-grammar/)
  — pattern elements, precedence, associativity by tail shape
- [Schemas & types](https://eralmansouri.github.io/stringent/guides/schemas-and-types/)
  — arktype definitions, binding references, polymorphic nodes
- [Error handling](https://eralmansouri.github.io/stringent/guides/error-handling/)
  — the error model in detail
- [Playground](https://eralmansouri.github.io/stringent/playground/)
  — try the runtime engine in your browser

## Development

```bash
pnpm install
pnpm typecheck   # includes type-level tests (src/**/*.typetest.ts)
pnpm test        # vitest runtime tests
pnpm bench       # vitest bench — parse/evaluate/compile benchmarks
pnpm build
pnpm check:package  # publint + arethetypeswrong
```

The type-level and runtime engines are hand-mirrored
(`src/parse/index.ts` ↔ `src/runtime/parser.ts`); the parity assertions in
`src/parser.test.ts` and `src/types.typetest.ts` pin both to the same
behavior — extend both when adding grammar features. See
[DESIGN.md](./DESIGN.md) for the full architecture and
[V2-PLAN.md](./V2-PLAN.md) for the v1→v2 migration table.

## License

MIT
