# Stringent

A type-safe expression parser and evaluator for TypeScript. One grammar definition drives two engines: a **type-level parser** (expressions in string literals are validated and fully typed at compile time) and a **runtime parser** (dynamic strings get structured errors and evaluation).

```typescript
const result = parser.evaluate(
  "values.password == values.confirmPassword",
  { values: { password: "string", confirmPassword: "string" } }, // schema
  { values: { password: "hunter2", confirmPassword: "hunter2" } } // values
);
//    ^? boolean (= true)
```

> **Note**
> Pre-1.0: the API is stabilizing but may still change between minor versions.
> See [DESIGN.md](./DESIGN.md) for the architecture and its rationale.

## Installation

```bash
npm install stringent
# or
pnpm add stringent
```

## Quickstart

### 1. Define your grammar

Each `defineNode` call declares one grammar rule: a pattern of elements, a
precedence, and (optionally) a result type and evaluation function.

```typescript
import {
  defineNode, number, string, path, lhs, rhs, expr, constVal,
  sameAs, fromBinding, createParser,
} from "stringent";

// Atoms — single-element passthrough patterns need no resultType
const numberLit = defineNode({ name: "num", pattern: [number()], precedence: "atom" });
const stringLit = defineNode({ name: "str", pattern: [string(['"', "'"])], precedence: "atom" });
const variable  = defineNode({ name: "var", pattern: [path()], precedence: "atom" });
// path() matches identifiers and dotted paths: x, values.password

// Polymorphic parens: the result type is whatever is inside
const parens = defineNode({
  name: "parens",
  pattern: [constVal("("), expr().as("inner"), constVal(")")],
  precedence: "atom",
  resultType: fromBinding("inner"),
  eval: ({ inner }) => inner,
});

// Same-type equality: 1 == 'a' is a parse-time type error
const eq = defineNode({
  name: "eq",
  pattern: [lhs().as("left"), constVal("=="), rhs(sameAs("left")).as("right")],
  precedence: 1,
  resultType: "boolean",
  eval: ({ left, right }) => left === right,
});

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

// A short-circuiting polymorphic ternary
const ternary = defineNode({
  name: "ternary",
  pattern: [
    lhs("boolean").as("cond"), constVal("?"),
    expr().as("then"), constVal(":"),
    rhs(sameAs("then")).as("else"),   // branches must agree
  ],
  precedence: 0,
  resultType: fromBinding("then"),    // result = the branches' type
  lazy: true,                         // eval receives thunks
  eval: ({ cond, then, else: alt }) => (cond() ? then() : alt()),
});

const parser = createParser(
  [numberLit, stringLit, variable, parens, ternary, eq, add, mul] as const
);
```

### 2. Parse string literals (compile-time checked)

`parse()` only accepts literals that fully parse against the grammar — an
invalid expression is a **compile-time error**, and the AST type is fully
inferred:

```typescript
const [ast] = parser.parse("1+2*3", {});
//     ^? { node: "add"; outputSchema: "number"; left: ...; right: ... }

parser.parse("1+", {});               // ✗ compile error
parser.parse("1+'a'", {});            // ✗ compile error: operand types disagree
parser.parse("1+x", { x: "number" }); // ✓
parser.parse("1+x", { x: "numbr" });  // ✗ compile error AT THE SCHEMA LEAF
```

Schema leaves are validated against the grammar's **type vocabulary** (all
declared `resultType`s + `number`/`string`/`boolean`/`unknown` + anything in
`createParser(nodes, { types: [...] })`), so schema typos fail at the typo,
not somewhere downstream.

### 3. Parse dynamic strings (runtime checked)

Runtime-provided input goes through `safeParse()`, which requires full
consumption and returns structured errors instead of throwing:

```typescript
const result = parser.safeParse(userInput, { x: "number" });
if (result.success) {
  console.log(result.ast);
} else {
  console.error(result.error.message);
  // e.g. Expected a number expression at position 2, got unknown ('zz' is not in the schema)
  // e.g. Expected a number (same type as 'left') expression at position 2, got string
  // e.g. Unexpected input at position 4: found "junk!!" (expected "*", "+" or "==")
  result.error.position; // 0-based offset
  result.error.expected; // tokens that would have been valid there
}
```

### 4. Evaluate

`evaluate()` parses and evaluates in one step; the result type is inferred
from the expression — including through polymorphic nodes:

```typescript
parser.evaluate("1+2*3", {}, {});                 // 7, typed number
parser.evaluate("'a'+'b'", {}, {});               // "ab", typed string
parser.evaluate("1==2 ? 'yes' : 'no'", {}, {});   // "no", typed string
parser.evaluate("x*2", { x: "number" }, { x: 21 }); // 42
```

For dynamic input, combine `safeParse` with `evaluateAst`:

```typescript
const parsed = parser.safeParse(userInput, schema);
if (parsed.success) {
  const value = parser.evaluateAst(parsed.ast, values);
}
```

Nodes with `lazy: true` receive **thunks** in `eval`, so untaken ternary
branches (and the right side of a short-circuiting `&&`) are never
evaluated.

## Polymorphic nodes

Three primitives replace per-type node variants:

- **Union constraints** — `lhs(["number", "string"])`: the slot accepts any
  of the listed types (operator overloading).
- **`sameAs(binding)`** — `rhs(sameAs("left"))`: this operand must have the
  same type as an earlier operand, whatever that turned out to be.
- **`fromBinding(binding)`** — `resultType: fromBinding("left")`: the node's
  result type is derived per-parse from a named operand.

`resultType` is only required where it cannot be derived: single-element
passthrough atoms omit it entirely, derivation handles polymorphic
operators, and a static name is for nodes that mint a new type (like `eq`
producing `"boolean"`).

## Nested schemas & member access

Schemas can nest; the `path()` element matches dotted paths and resolves
their types by walking the schema — at compile time *and* runtime:

```typescript
const schema = { values: { password: "string", confirmPassword: "string" } } as const;

const [ast] = parser.parse("values.password == values.confirmPassword", schema);
// left/right are PathNode<["values", "password"], "string">, result is "boolean"
```

Path syntax is strict: `values.password` is valid, but whitespace around the
dot (`values . password`) and dangling dots (`values.`) are not. Lookups are
own-property only — `__proto__`, `constructor` and friends never resolve to
prototype internals, at parse time or eval time.

## Pattern elements

| Pattern | Description |
|---------|-------------|
| `number()` | Numeric literals |
| `string(quotes)` | Quoted strings, e.g. `string(['"', "'"])` |
| `ident()` | Single identifier, type resolved from schema |
| `path()` | Identifier or dotted path (`values.password`), resolved via nested schema |
| `constVal(value)` | Exact string (operators, keywords, delimiters) |
| `lhs(constraint?)` | Left operand — parses at the next-higher precedence level |
| `rhs(constraint?)` | Right operand — same level (right-assoc) or next level (left-assoc fold) |
| `expr(constraint?)` | Full expression — resets to the whole grammar (parens, ternary branches) |

Use `.as(name)` to capture an element as a named binding — bindings become
fields on the AST node and typed parameters of `eval`.

## Precedence & associativity

- **Precedence** is a non-negative integer (`"atom"` for literals). Lower
  numbers bind looser (outermost in the tree); higher bind tighter.
- **Associativity** is per precedence level (all nodes at one level must
  agree) and defaults to `"right"`:
  - `associativity: "left"`: `5-2-1` → `(5-2)-1` — for `-`, `/`, and friends.
  - `"right"` (default): `2^3^2` → `2^(3^2)` — for exponentiation, ternaries.
- `createParser` validates the whole grammar up front — duplicate/reserved
  names, malformed patterns, left-recursive shapes, unknown constraint
  names, dangling `sameAs`/`fromBinding` references — with descriptive
  errors. A grammar that constructs is a grammar that parses safely.

## Error handling

`safeParse` never throws for input. Its error object:

```typescript
interface StringentError {
  code: "PARSE_ERROR" | "TYPE_MISMATCH" | "UNEXPECTED_INPUT";
  message: string;
  position: number;              // 0-based offset into the input
  expected?: readonly string[];  // what would have been valid at position
  found?: string;                // the next few characters at position
}
```

Invalid **schemas** (unknown type names) throw — they are programmer errors,
not input errors. `parse()` and `evaluate()` throw `StringentParseError` if
their compile-time validation was bypassed with a cast. `evaluateAst` throws
`EvaluationError` for undefined identifiers/paths or nodes without `eval`.

## Limits & rules

- **Precedence** must be `"atom"` or a non-negative safe integer.
- **Dynamic strings** are rejected by `parse()` at compile time — use `safeParse()`.
- **Type-level input length**: left-associative chains use a tail-recursive
  fold and comfortably handle 100+ terms. Right-associative chains and deeply
  nested expressions hit TypeScript's instantiation-depth limit around a few
  dozen tokens. Runtime parsing (`safeParse`) has no such limit.
- **Whitespace** is skipped between tokens, but not allowed inside paths around `.`.

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
