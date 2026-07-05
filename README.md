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

## Installation

```bash
npm install stringent
# or
pnpm add stringent
```

## Quickstart

### 1. Define your grammar

Each `defineNode` call declares one grammar rule: a pattern of elements, a precedence, a result type, and (optionally) how to evaluate it.

```typescript
import {
  defineNode, number, path, lhs, rhs, expr, constVal, createParser,
} from "stringent";

// Atoms (literals and variables)
const numberLit = defineNode({
  name: "number",
  pattern: [number()],
  precedence: "atom",
  resultType: "number",
});

const variable = defineNode({
  name: "var",
  pattern: [path()], // matches identifiers and dotted paths: x, values.password
  precedence: "atom",
  resultType: "unknown",
});

const parens = defineNode({
  name: "parens",
  pattern: [constVal("("), expr("number").as("inner"), constVal(")")],
  precedence: "atom",
  resultType: "number",
  eval: ({ inner }) => inner,
});

// Binary operators
const add = defineNode({
  name: "add",
  pattern: [lhs("number").as("left"), constVal("+"), rhs("number").as("right")],
  precedence: 1,            // lower = binds looser
  associativity: "left",    // 1+2+3 parses as (1+2)+3
  resultType: "number",
  eval: ({ left, right }) => left + right, // left/right are typed as number
});

const mul = defineNode({
  name: "mul",
  pattern: [lhs("number").as("left"), constVal("*"), rhs("number").as("right")],
  precedence: 2,            // higher = binds tighter
  associativity: "left",
  resultType: "number",
  eval: ({ left, right }) => left * right,
});

const parser = createParser([numberLit, variable, parens, add, mul] as const);
```

### 2. Parse string literals (compile-time checked)

`parse()` only accepts literals that fully parse against the grammar — an invalid expression is a **compile-time error**, and the AST type is fully inferred:

```typescript
const [ast] = parser.parse("1+2*3", {});
//     ^? { node: "add"; left: NumberNode<"1">; right: { node: "mul"; ... } }

parser.parse("1+", {});      // ✗ compile error
parser.parse("1+x", {});     // ✗ compile error: x not in schema
parser.parse("1+x", { x: "number" }); // ✓
```

### 3. Parse dynamic strings (runtime checked)

Runtime-provided input goes through `safeParse()`, which requires full consumption and returns structured errors instead of throwing:

```typescript
const result = parser.safeParse(userInput, { x: "number" });
if (result.success) {
  console.log(result.ast);
} else {
  console.error(result.error.message);
  // e.g. Expected a number expression at position 2, got unknown ('zz' is not in the schema)
  // e.g. Expected "*", "+" or end of input at position 4, found "junk!!"
  result.error.position; // 0-based offset
  result.error.expected; // tokens that would have been valid there
}
```

### 4. Evaluate

`evaluate()` parses and evaluates in one step; the result type is inferred from the expression:

```typescript
const n = parser.evaluate("1+2*3", {}, {});          // 7, typed as number
const y = parser.evaluate("x*2", { x: "number" }, { x: 21 }); // 42
```

For dynamic input, combine `safeParse` with `evaluateAst`:

```typescript
const parsed = parser.safeParse(userInput, schema);
if (parsed.success) {
  const value = parser.evaluateAst(parsed.ast, values);
}
```

## Nested schemas & member access

Schemas can nest; the `path()` element matches dotted paths and resolves their types by walking the schema — at compile time *and* runtime:

```typescript
const schema = {
  values: { password: "string", confirmPassword: "string" },
} as const;

const [ast] = parser.parse("values.password == values.confirmPassword", schema);
// left/right are PathNode<["values", "password"], "string">, result is "boolean"
```

Path syntax is strict: `values.password` is valid, but whitespace around the dot (`values . password`) and dangling dots (`values.`) are not.

## Pattern elements

| Pattern | Description |
|---------|-------------|
| `number()` | Numeric literals |
| `string(quotes)` | Quoted strings, e.g. `string(['"', "'"])` |
| `ident()` | Single identifier, type resolved from schema |
| `path()` | Identifier or dotted path (`values.password`), resolved via nested schema |
| `constVal(value)` | Exact string (operators, keywords, delimiters) |
| `lhs(constraint?)` | Left operand — parses at the next-higher precedence level (avoids left-recursion) |
| `rhs(constraint?)` | Right operand — same level for right-associativity, next level in left-associative rules |
| `expr(constraint?)` | Full expression — resets to the whole grammar (parens, function args, ternary branches) |

Use `.as(name)` to capture an element as a named binding — bindings become fields on the AST node and typed parameters of `eval`:

```typescript
lhs("number").as("left") // AST gets { left: ... }; eval receives { left: number }
```

The optional constraint string (`"number"`, `"string"`, ...) restricts which expressions an operand slot accepts; mismatches backtrack and are reported as `TYPE_MISMATCH` errors.

## Precedence & associativity

- **Precedence** is a non-negative integer (`"atom"` for literals). Lower numbers bind looser (parsed first, outermost in the tree); higher numbers bind tighter.
- **Associativity** is per precedence level (all nodes at one level must agree) and defaults to `"right"`:
  - `associativity: "left"`: `5-2-1` → `(5-2)-1` — what you want for `-`, `/`, and friends.
  - `"right"` (default): `2^3^2` → `2^(3^2)` — for exponentiation, assignment, comparisons.
- Left-associative rules must have a pattern starting with `lhs(...)` followed by at least one more element. `createParser` validates all of this up front and throws descriptive errors.

## Error handling

`safeParse` never throws. Its error object:

```typescript
interface StringentError {
  code: "PARSE_ERROR" | "TYPE_MISMATCH" | "UNEXPECTED_INPUT";
  message: string;
  position: number;              // 0-based offset into the input
  expected?: readonly string[];  // what would have been valid at position
  found?: string;                // the next few characters at position
}
```

`parse()` and `evaluate()` throw `StringentParseError` (same fields) if their compile-time validation was bypassed with a cast. `evaluateAst` throws `EvaluationError` for undefined identifiers/paths or nodes without an `eval` function.

## Limits & rules

- **Precedence** must be `"atom"` or a non-negative integer.
- **Dynamic strings** (`string`, not a literal) are rejected by `parse()` at compile time — use `safeParse()`.
- **Type-level input length**: left-associative operator chains use a tail-recursive fold and comfortably handle 100+ terms. Right-associative chains and deeply nested expressions recurse per level and hit TypeScript's instantiation-depth limit around a few dozen tokens. Runtime parsing (`safeParse`) has no such limit.
- **Whitespace** is skipped between tokens (delegated to [parsebox](https://github.com/sinclairzx81/parsebox) tokenization), but not allowed inside paths around `.`.

## Development

```bash
pnpm install
pnpm typecheck   # includes type-level tests (src/**/*.typetest.ts)
pnpm test        # vitest runtime tests
pnpm build
pnpm check:package  # publint + arethetypeswrong
```

The type-level and runtime engines are hand-mirrored (`src/parse/index.ts` ↔ `src/runtime/parser.ts`); the parity assertions in `src/parser.test.ts` and `src/types.typetest.ts` pin both to the same behavior — extend both when adding grammar features.

## License

MIT
