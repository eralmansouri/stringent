# Stringent

[![npm version](https://img.shields.io/npm/v/stringent.svg)](https://www.npmjs.com/package/stringent)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A type-safe expression parser for TypeScript with compile-time validation and inference.

> **Warning**
> This library is under active development and not yet ready for production use. APIs may change.

## Overview

Stringent parses and validates expressions like `values.password == values.confirmPassword` against a schema at both compile-time and runtime, with full TypeScript type inference for expression results.

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

// Type-safe parsing - result type is inferred at compile-time
const result = parser.parse("1+2*3", {});
// Parses as: add(1, mul(2, 3)) because * binds tighter than +
```

### 3. Evaluate Expressions

```typescript
import { evaluate } from 'stringent';

if (result.length === 2) {
  const value = evaluate(result[0], { data: {}, nodes: [add, mul] });
  console.log(value); // 7 (1 + 2*3 = 1 + 6 = 7)
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
import { defineNode, constVal, lhs, rhs, createParser, evaluate } from 'stringent';

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

const result = parser.parse("5 > 3", {});
if (result.length === 2) {
  const value = evaluate(result[0], { data: {}, nodes: [eq, neq, lt, gt] });
  console.log(value); // true
}
```

### Conditional (Ternary) Expressions

```typescript
import { defineNode, constVal, lhs, rhs, expr, createParser, evaluate } from 'stringent';

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

const result = parser.parse("5 > 3 ? 10 : 20", {});
if (result.length === 2) {
  const value = evaluate(result[0], { data: {}, nodes: [gt, ternary] });
  console.log(value); // 10
}
```

### Field Validation with Context

Stringent supports identifier resolution from a schema context, enabling form validation expressions:

```typescript
import { defineNode, constVal, lhs, rhs, createParser, evaluate } from 'stringent';

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
const result = parser.parse("password == confirmPassword", {
  password: "string",
  confirmPassword: "string",
} satisfies FormSchema);

if (result.length === 2) {
  // Evaluate with actual form data
  const formData = {
    password: "secret123",
    confirmPassword: "secret123",
  };

  const isValid = evaluate(result[0], {
    data: formData,
    nodes: [eq]
  });
  console.log(isValid); // true
}
```

### Boolean Logic

```typescript
import { defineNode, constVal, lhs, rhs, createParser, evaluate } from 'stringent';

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
const result = parser.parse("true || false && false", {});
if (result.length === 2) {
  const value = evaluate(result[0], { data: {}, nodes: [and, or] });
  console.log(value); // true
}
```

### String Concatenation

```typescript
import { defineNode, constVal, lhs, rhs, createParser, evaluate } from 'stringent';

const concat = defineNode({
  name: "concat",
  pattern: [lhs("string").as("left"), constVal("++"), rhs("string").as("right")],
  precedence: 1,
  resultType: "string",
  eval: ({ left, right }) => left + right,
});

const parser = createParser([concat] as const);

const result = parser.parse('"Hello" ++ " " ++ "World"', {});
if (result.length === 2) {
  const value = evaluate(result[0], { data: {}, nodes: [concat] });
  console.log(value); // "Hello World"
}
```

### Nullish Coalescing

```typescript
import { defineNode, constVal, lhs, rhs, createParser, evaluate } from 'stringent';

const nullishCoalesce = defineNode({
  name: "nullishCoalesce",
  pattern: [lhs().as("left"), constVal("??"), rhs().as("right")],
  precedence: 1,
  resultType: "unknown",
  eval: ({ left, right }) => left ?? right,
});

const parser = createParser([nullishCoalesce] as const);

const result = parser.parse("null ?? 42", {});
if (result.length === 2) {
  const value = evaluate(result[0], { data: {}, nodes: [nullishCoalesce] });
  console.log(value); // 42
}
```

## Error Handling

### Parse Failures

When parsing fails, the result is an empty array:

```typescript
const result = parser.parse("@invalid", {});
if (result.length === 0) {
  console.log("Parse failed: no grammar rule matched");
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

- **Compile-time validation**: Invalid expressions fail TypeScript compilation
- **Type inference**: Expression result types are inferred automatically
- **Operator precedence**: Correct parsing of complex expressions with configurable precedence levels
- **Schema-aware**: Validates field references against your schema
- **Dual API**: Same parsing logic at compile-time (types) and runtime
- **Evaluation**: Built-in `evaluate` function to compute expression values
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

### `evaluate(ast, context)`

Recursively evaluates an AST node to produce a runtime value.

```typescript
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
