# Stringent

[![npm version](https://img.shields.io/npm/v/stringent.svg)](https://www.npmjs.com/package/stringent)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A type-safe expression parser for TypeScript with compile-time validation and inference, powered by [ArkType](https://arktype.io/).

> **Warning**
> This library is under active development and not yet ready for production use. APIs may change.

## Overview

Stringent parses and validates expressions like `values.password == values.confirmPassword` against a schema at both compile-time and runtime, with full TypeScript type inference for expression results.

**Key Features:**
- **ArkType Integration** - Schema types are validated at compile-time AND runtime using ArkType
- **Full Type Inference** - Return types flow from `resultType` → `outputSchema` → `evaluate()` return
- **Constraint Validation** - Use ArkType constraints like `'number >= 0'`, `'string.email'`, etc.
- **Computed Result Types** - Ternary expressions infer union types like `'boolean | number'`

## Installation

```bash
npm install stringent
# or
pnpm add stringent
```

## Requirements

- **TypeScript**: 5.0 or higher (uses `const` type parameters)
- **Node.js**: 18.0 or higher (ES2022 target)

## Quick Start

### 1. Define Your Grammar

Use `defineNode` to create operators with patterns, precedence, and result types:

```typescript
import { defineNode, constVal, lhs, rhs, createParser } from 'stringent';

const add = defineNode({
  name: "add",
  pattern: [lhs("number").as("left"), constVal("+"), rhs("number").as("right")],
  precedence: 1,  // Lower = binds looser
  resultType: "number",
  eval: ({ left, right }) => left + right,
});

const mul = defineNode({
  name: "mul",
  pattern: [lhs("number").as("left"), constVal("*"), rhs("number").as("right")],
  precedence: 2,  // Higher = binds tighter
  resultType: "number",
  eval: ({ left, right }) => left * right,
});
```

### 2. Create a Parser

```typescript
// Only pass operators - atoms (numbers, strings, identifiers, etc.) are built-in
const parser = createParser([add, mul] as const);

// Type-safe parsing returns a bound evaluator
const [evaluator, err] = parser.parse("1+2*3", {});
// Parses as: add(1, mul(2, 3)) because * binds tighter than +
```

### 3. Evaluate Expressions

```typescript
if (!err) {
  const value = evaluator({ /* data */ });
  // TypeScript knows: typeof value === number (inferred from outputSchema!)
  console.log(value); // 7 (1 + 2*3 = 1 + 6 = 7)

  // Access the AST if needed
  console.log(evaluator.ast); // { node: 'add', ... }
}
```

### Type-Safe Evaluation

The bound evaluator returned by `parser.parse()` preserves compile-time type information. The return type is automatically inferred from the AST node's `outputSchema`:

```typescript
import { createParser, defineNode, lhs, rhs, constVal } from 'stringent';

// Number result type
const add = defineNode({
  name: "add",
  pattern: [lhs("number").as("left"), constVal("+"), rhs("number").as("right")],
  precedence: 1,
  resultType: "number",  // This becomes the outputSchema
  eval: ({ left, right }) => left + right,
});

const parser = createParser([add] as const);
const [evaluator, err] = parser.parse("1 + 2", {});

if (!err) {
  const value = evaluator({});
  // TypeScript infers: value: number
  // NOT unknown!
}

// Boolean result type
const eq = defineNode({
  name: "eq",
  pattern: [lhs("number").as("left"), constVal("=="), rhs("number").as("right")],
  precedence: 1,
  resultType: "boolean",  // Numbers in, boolean out
  eval: ({ left, right }) => left === right,
});

const eqParser = createParser([eq] as const);
const [eqEvaluator, eqErr] = eqParser.parse("1 == 2", {});

if (!eqErr) {
  const isEqual = eqEvaluator({});
  // TypeScript infers: isEqual: boolean
}

// String result type
const concat = defineNode({
  name: "concat",
  pattern: [lhs("string").as("left"), constVal("++"), rhs("string").as("right")],
  precedence: 1,
  resultType: "string",
  eval: ({ left, right }) => left + right,
});

const concatParser = createParser([concat] as const);
const [concatEvaluator, concatErr] = concatParser.parse('"hello" ++ "world"', {});

if (!concatErr) {
  const str = concatEvaluator({});
  // TypeScript infers: str: string
}
```

This is the core value proposition of Stringent: **compile-time type safety flows through parsing and evaluation**.

## ArkType Integration

Stringent uses [ArkType](https://arktype.io/) for compile-time AND runtime type validation. This means schema types, constraints, and data are all validated using the same type system.

### Supported ArkType Types

Stringent supports the full range of ArkType type definitions:

| Category | Examples | TypeScript Type |
|----------|----------|-----------------|
| **Primitives** | `'number'`, `'string'`, `'boolean'`, `'null'`, `'undefined'` | `number`, `string`, etc. |
| **Subtypes** | `'string.email'`, `'string.uuid'`, `'string.url'`, `'number.integer'` | `string`, `number` |
| **Constraints** | `'number >= 0'`, `'number > 0'`, `'1 <= number <= 100'`, `'string >= 8'` | `number`, `string` |
| **Unions** | `'string \| number'`, `'boolean \| null'` | `string \| number`, etc. |
| **Arrays** | `'string[]'`, `'number[]'`, `'(string \| number)[]'` | `string[]`, etc. |

### Compile-Time Schema Validation

Schema types are validated at compile-time. Invalid type strings cause TypeScript errors:

```typescript
import { createParser, defineNode, lhs, rhs, constVal } from 'stringent';

const add = defineNode({
  name: 'add',
  pattern: [lhs('number').as('left'), constVal('+'), rhs('number').as('right')],
  precedence: 1,
  resultType: 'number',
  eval: ({ left, right }) => left + right,
});

const parser = createParser([add] as const);

// Valid arktype types work
parser.parse('x + 1', { x: 'number' });          // OK
parser.parse('x + 1', { x: 'number >= 0' });     // OK - constrained number
parser.parse('x + 1', { x: 'number.integer' }); // OK - integer subtype

// Invalid types cause TypeScript errors
// @ts-expect-error - 'garbage' is not a valid arktype
parser.parse('x + 1', { x: 'garbage' });

// @ts-expect-error - 'nubmer' is misspelled
parser.parse('x + 1', { x: 'nubmer' });
```

### Compile-Time Constraint Validation

The `lhs()`, `rhs()`, and `expr()` functions validate their constraints at compile-time:

```typescript
// Valid constraints
lhs('number');           // OK
lhs('string.email');     // OK - email subtype
lhs('number >= 0');      // OK - constrained number
lhs('string | number');  // OK - union type

// Invalid constraints cause TypeScript errors
// @ts-expect-error - 'garbage' is not a valid arktype
lhs('garbage');
```

### Runtime Data Validation

Data passed to the evaluator is validated at runtime against ArkType schemas:

```typescript
const parser = createParser([add] as const);
const [evaluator, err] = parser.parse('x + y', { x: 'number >= 0', y: 'number' });

if (!err) {
  // This works - x is a non-negative number
  evaluator({ x: 5, y: 3 });
  // Returns: 8

  // This throws at runtime - x must be >= 0
  evaluator({ x: -5, y: 3 });
  // Throws: "Data validation failed: ..."
}
```

### ArkType Subtype Validation

Subtypes like `string.email` validate format at runtime:

```typescript
const emailSchema = { email: 'string.email' };
const [evaluator, err] = parser.parse('email', emailSchema);

if (!err) {
  // Valid email - works
  evaluator({ email: 'test@example.com' });

  // Invalid email - throws
  evaluator({ email: 'not-an-email' });
  // Throws: "Data validation failed: ..."
}
```

### Computed Union Result Types

For nodes like ternary expressions where the result type depends on the branches, you can use computed union result types:

```typescript
const ternary = defineNode({
  name: 'ternary',
  pattern: [
    lhs('boolean').as('condition'),
    constVal('?'),
    expr().as('then'),
    constVal(':'),
    rhs().as('else'),
  ],
  precedence: 0,
  resultType: { union: ['then', 'else'] } as const,  // Compute union from branches
  eval: ({ condition, then: thenVal, else: elseVal }) => (condition ? thenVal : elseVal),
});

const parser = createParser([ternary] as const);

// x ? true : 0
// then branch: boolean, else branch: number
// Result type: boolean | number
const [evaluator, err] = parser.parse('true ? 1 : "hello"', {});

if (!err) {
  const value = evaluator({});
  // TypeScript infers: value is string | number
}
```

### Type-Safe Data Requirements

The evaluator enforces that data matches the schema at the type level:

```typescript
const [evaluator, err] = parser.parse('x + y', { x: 'number', y: 'number' });

if (!err) {
  // OK - all required variables provided with correct types
  evaluator({ x: 5, y: 3 });

  // @ts-expect-error - x should be number, not string
  evaluator({ x: 'wrong', y: 3 });

  // @ts-expect-error - y is required but missing
  evaluator({ x: 5 });
}
```

## Pattern Elements

Pattern elements define what your grammar matches. All elements support `.as(name)` for capturing values in the AST.

### Atoms (Built-in)

| Pattern | Description | Example Match |
|---------|-------------|---------------|
| `number()` | Numeric literals | `42`, `3.14`, `0.5` |
| `string(['"', "'"])` | Quoted strings | `"hello"`, `'world'` |
| `ident()` | Identifiers | `foo`, `myVar`, `_value` |
| `nullLiteral()` | The `null` keyword | `null` |
| `booleanLiteral()` | Boolean keywords | `true`, `false` |
| `undefinedLiteral()` | The `undefined` keyword | `undefined` |

### Expression Roles

These determine how precedence is handled for recursive expressions:

| Pattern | Description | Use Case |
|---------|-------------|----------|
| `lhs(constraint?)` | Left operand, uses higher precedence level | Binary operator left side (avoids left-recursion) |
| `rhs(constraint?)` | Right operand, uses same precedence level | Binary operator right side (enables right-associativity) |
| `expr(constraint?)` | Full expression, resets to lowest precedence | Parentheses, ternary branches, function arguments |

### Constants

| Pattern | Description | Example |
|---------|-------------|---------|
| `constVal(value)` | Exact string match | `constVal("+")`, `constVal("==")`, `constVal("?")` |

### Capturing Values

Use `.as(name)` to capture pattern elements in the AST:

```typescript
lhs("number").as("left")   // Captures left operand as "left"
rhs("number").as("right")  // Captures right operand as "right"
expr().as("inner")         // Captures expression as "inner"
```

## Examples

### Comparison Operators

```typescript
import { defineNode, constVal, lhs, rhs, createParser } from 'stringent';

const eq = defineNode({
  name: "eq",
  pattern: [lhs().as("left"), constVal("=="), rhs().as("right")],
  precedence: 1,
  resultType: "boolean",
  eval: ({ left, right }) => left === right,
});

const neq = defineNode({
  name: "neq",
  pattern: [lhs().as("left"), constVal("!="), rhs().as("right")],
  precedence: 1,
  resultType: "boolean",
  eval: ({ left, right }) => left !== right,
});

const lt = defineNode({
  name: "lt",
  pattern: [lhs("number").as("left"), constVal("<"), rhs("number").as("right")],
  precedence: 1,
  resultType: "boolean",
  eval: ({ left, right }) => left < right,
});

const gt = defineNode({
  name: "gt",
  pattern: [lhs("number").as("left"), constVal(">"), rhs("number").as("right")],
  precedence: 1,
  resultType: "boolean",
  eval: ({ left, right }) => left > right,
});

const parser = createParser([eq, neq, lt, gt] as const);

const [evaluator, err] = parser.parse("5 > 3", {});
if (!err) {
  const value = evaluator({});
  console.log(value); // true
}
```

### Conditional (Ternary) Expressions

```typescript
import { defineNode, constVal, lhs, rhs, expr, createParser } from 'stringent';

// Define comparison first
const gt = defineNode({
  name: "gt",
  pattern: [lhs("number").as("left"), constVal(">"), rhs("number").as("right")],
  precedence: 2,
  resultType: "boolean",
  eval: ({ left, right }) => left > right,
});

// Ternary has lower precedence than comparison
const ternary = defineNode({
  name: "ternary",
  pattern: [
    lhs("boolean").as("condition"),
    constVal("?"),
    expr().as("then"),      // Full expression for branches
    constVal(":"),
    rhs().as("else"),
  ],
  precedence: 1,
  resultType: "unknown",
  eval: ({ condition, then: thenVal, else: elseVal }) =>
    condition ? thenVal : elseVal,
});

const parser = createParser([gt, ternary] as const);

const [evaluator, err] = parser.parse("5 > 3 ? 10 : 20", {});
if (!err) {
  const value = evaluator({});
  console.log(value); // 10
}
```

### Field Validation with Context

Stringent supports identifier resolution from a schema context, enabling form validation expressions:

```typescript
import { defineNode, constVal, lhs, rhs, createParser } from 'stringent';

const eq = defineNode({
  name: "eq",
  pattern: [lhs().as("left"), constVal("=="), rhs().as("right")],
  precedence: 1,
  resultType: "boolean",
  eval: ({ left, right }) => left === right,
});

const parser = createParser([eq] as const);

// Define the schema for your form fields
type FormSchema = {
  password: "string";
  confirmPassword: "string";
};

// Parse with schema - identifiers resolve their types from the schema
const [evaluator, err] = parser.parse("password == confirmPassword", {
  password: "string",
  confirmPassword: "string",
} satisfies FormSchema);

if (!err) {
  // Evaluate with actual form data
  const formData = {
    password: "secret123",
    confirmPassword: "secret123",
  };

  const isValid = evaluator(formData);
  console.log(isValid); // true
}
```

### Boolean Logic

```typescript
import { defineNode, constVal, lhs, rhs, createParser } from 'stringent';

const and = defineNode({
  name: "and",
  pattern: [lhs("boolean").as("left"), constVal("&&"), rhs("boolean").as("right")],
  precedence: 2,
  resultType: "boolean",
  eval: ({ left, right }) => left && right,
});

const or = defineNode({
  name: "or",
  pattern: [lhs("boolean").as("left"), constVal("||"), rhs("boolean").as("right")],
  precedence: 1,  // || has lower precedence than &&
  resultType: "boolean",
  eval: ({ left, right }) => left || right,
});

const parser = createParser([and, or] as const);

// true || false && false → true || (false && false) → true || false → true
const [evaluator, err] = parser.parse("true || false && false", {});
if (!err) {
  const value = evaluator({});
  console.log(value); // true
}
```

### String Concatenation

```typescript
import { defineNode, constVal, lhs, rhs, createParser } from 'stringent';

const concat = defineNode({
  name: "concat",
  pattern: [lhs("string").as("left"), constVal("++"), rhs("string").as("right")],
  precedence: 1,
  resultType: "string",
  eval: ({ left, right }) => left + right,
});

const parser = createParser([concat] as const);

const [evaluator, err] = parser.parse('"Hello" ++ " " ++ "World"', {});
if (!err) {
  const value = evaluator({});
  console.log(value); // "Hello World"
}
```

### Nullish Coalescing

```typescript
import { defineNode, constVal, lhs, rhs, createParser } from 'stringent';

const nullishCoalesce = defineNode({
  name: "nullishCoalesce",
  pattern: [lhs().as("left"), constVal("??"), rhs().as("right")],
  precedence: 1,
  resultType: "unknown",
  eval: ({ left, right }) => left ?? right,
});

const parser = createParser([nullishCoalesce] as const);

const [evaluator, err] = parser.parse("null ?? 42", {});
if (!err) {
  const value = evaluator({});
  console.log(value); // 42
}
```

## Error Handling

### Parse Failures

When parsing fails, the result is `[null, Error]`:

```typescript
const [evaluator, err] = parser.parse("@invalid", {});
if (err) {
  console.log("Parse failed:", err.message);
}
```

### Type-Level Validation

Stringent validates expressions at compile time. Invalid expressions won't type-check:

```typescript
const parser = createParser([add, mul] as const);

// This compiles - valid expression
const good = parser.parse("1+2*3", {});

// This causes a TypeScript error - invalid syntax
// @ts-expect-error
const bad = parser.parse("1++2", {});
```

### Type Constraint Violations

Constraints on `lhs`, `rhs`, and `expr` are enforced at both compile time and runtime:

```typescript
const numericAdd = defineNode({
  name: "add",
  pattern: [lhs("number").as("left"), constVal("+"), rhs("number").as("right")],
  precedence: 1,
  resultType: "number",
});

// This fails at compile time - "hello" is not a number
// @ts-expect-error
parser.parse('"hello" + 1', {});
```

### Runtime Errors in Evaluation

The `evaluate` function throws on invalid AST nodes or missing variables:

```typescript
try {
  evaluate(null, { data: {}, nodes: [] });
} catch (e) {
  console.log(e.message); // "Invalid AST node: null or undefined"
}

try {
  // Evaluating an identifier that's not in the data context
  evaluate({ node: "identifier", name: "x", outputSchema: "unknown" }, { data: {}, nodes: [] });
} catch (e) {
  console.log(e.message); // "Undefined variable: x"
}
```

## Key Features

- **ArkType Integration**: Schema types validated at compile-time AND runtime using [ArkType](https://arktype.io/)
- **Compile-time validation**: Invalid expressions AND invalid type strings fail TypeScript compilation
- **Type-safe evaluation**: `evaluate()` returns the correct TypeScript type based on `outputSchema`
- **Runtime constraint validation**: ArkType constraints (`'number >= 0'`, `'string.email'`) validated at runtime
- **Computed result types**: Ternary and similar nodes compute union result types from branches
- **Type inference**: Expression result types are inferred automatically through parsing and evaluation
- **Operator precedence**: Correct parsing of complex expressions with configurable precedence levels
- **Schema-aware**: Validates field references against your schema
- **Dual API**: Same parsing logic at compile-time (types) and runtime
- **Evaluation**: Built-in `evaluate` function to compute expression values with full type inference
- **String escapes**: Full support for escape sequences (`\n`, `\t`, `\\`, `\"`, `\'`, `\uXXXX`, `\xHH`)

## API Reference

### `createParser(nodes)`

Creates a type-safe parser from node schemas.

```typescript
const parser = createParser([add, mul] as const);
```

### `defineNode(config)`

Defines a grammar node with pattern, precedence, and optional evaluation function.

```typescript
defineNode({
  name: string,           // Unique node name
  pattern: PatternElement[], // Pattern to match
  precedence: number,     // Lower = binds looser
  resultType: string,     // Output type (e.g., "number", "boolean")
  eval?: Function,        // Optional evaluation function
  configure?: Function,   // Optional AST transformation
})
```

### `parser.parse(input, schema)`

Parses an input string and returns a bound evaluator.

```typescript
const [evaluator, err] = parser.parse("x + 1", { x: 'number' });
if (!err) {
  const result = evaluator({ x: 5 }); // 6
  console.log(evaluator.ast);         // The parsed AST
  console.log(evaluator.schema);      // { x: 'number' }
}
```

### `evaluate(ast, context)`

Low-level function that evaluates an AST node. Most users should use the bound evaluator from `parser.parse()` instead.

```typescript
import { evaluate } from 'stringent';

evaluate(ast, {
  data: Record<string, unknown>,  // Variable values
  nodes: NodeSchema[],            // Node schemas with eval functions
})
```

### `infer(ast)`

Infers the result type of an AST node at runtime.

```typescript
const type = infer(ast); // "number" | "string" | "boolean" | "null" | "undefined" | "unknown"
```

## License

MIT
