# Stringent API Reference

This document provides detailed API documentation for all public exports from the Stringent library.

## Table of Contents

- [Core API](#core-api)
  - [createParser()](#createparser)
  - [defineNode()](#definenode)
- [Pattern Element Factories](#pattern-element-factories)
  - [Atom Factories](#atom-factories)
  - [Expression Factories](#expression-factories)
  - [The .as() Method](#the-as-method)
- [Runtime Functions](#runtime-functions)
  - [evaluate()](#evaluate)
  - [createEvaluator()](#createevaluator)
  - [infer()](#infer)
  - [parseWithErrors()](#parsewitherrors)
- [ArkType Integration](#arktype-integration)
  - [Supported Types](#supported-types)
  - [Compile-Time Validation](#compile-time-validation)
  - [Runtime Validation](#runtime-validation)
  - [Computed Result Types](#computed-result-types)
- [Types](#types)
  - [Parser](#parser)
  - [NodeSchema](#nodeschema)
  - [Context](#context)
  - [Grammar](#grammar)
  - [AST Node Types](#ast-node-types)
- [Error Handling](#error-handling)
  - [Error Types](#error-types)
  - [Error Utilities](#error-utilities)

---

## Core API

### createParser()

Creates a type-safe parser from node schemas.

```typescript
function createParser<const TNodes extends readonly NodeSchema[]>(
  nodes: TNodes
): Parser<ComputeGrammar<TNodes>, TNodes>
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `nodes` | `readonly NodeSchema[]` | Tuple of node schemas defining the grammar. Must use `as const` for type inference. |

#### Returns

A `Parser` instance with:
- `parse(input, schema)` - Type-safe parse method
- `nodes` - The node schemas used to create the parser

#### Example

```typescript
import { createParser, defineNode, number, lhs, rhs, constVal } from "stringent";

const numberLit = defineNode({
  name: "number",
  pattern: [number()],
  precedence: 0,
  resultType: "number",
});

const add = defineNode({
  name: "add",
  pattern: [lhs("number").as("left"), constVal("+"), rhs("number").as("right")],
  precedence: 1,
  resultType: "number",
  eval: ({ left, right }) => left + right,
});

// IMPORTANT: Use `as const` for proper type inference
const parser = createParser([numberLit, add] as const);

// Type-safe parsing - input must parse completely
const result = parser.parse("1+2", {});
// Type: [{ node: "add", outputSchema: "number", left: NumberNode<"1">, right: NumberNode<"2"> }, ""]
```

#### Type Safety

The parser validates input at compile-time:

```typescript
// This compiles - valid expression
parser.parse("1+2", {});

// This fails at compile-time - invalid expression
parser.parse("1+", {});  // Error: Argument of type '"1+"' is not assignable to parameter
```

---

### defineNode()

Defines a node type for the grammar. Uses TypeScript's `const` modifier to preserve literal types.

```typescript
function defineNode<
  const TName extends string,
  const TPattern extends readonly PatternSchema[],
  const TPrecedence extends Precedence,
  const TResultType extends string
>(config: {
  readonly name: TName;
  readonly pattern: TPattern;
  readonly precedence: TPrecedence;
  readonly resultType: TResultType;
  readonly configure?: (bindings, ctx) => Record<string, unknown>;
  readonly eval?: (values, ctx) => SchemaToType<TResultType>;
}): NodeSchema<TName, TPattern, TPrecedence, TResultType>
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | `string` | Unique identifier for this node type |
| `pattern` | `readonly PatternSchema[]` | Pattern elements defining the syntax |
| `precedence` | `number` | Operator precedence (lower = binds looser) |
| `resultType` | `string \| UnionResultType` | The output type - a valid ArkType string or `{ union: [...] }` for computed types |
| `configure` | `(bindings, ctx) => object` | Optional. Transform parsed bindings into node fields |
| `eval` | `(values, ctx) => value` | Optional. Evaluate the node to produce a runtime value |

#### resultType Validation

The `resultType` parameter is validated at compile-time using ArkType. Only valid type strings are accepted:

```typescript
// Valid result types
defineNode({ ..., resultType: 'number' });           // Primitive
defineNode({ ..., resultType: 'string.email' });    // Subtype
defineNode({ ..., resultType: 'number >= 0' });     // Constraint
defineNode({ ..., resultType: 'string | number' }); // Union

// Invalid result types cause TypeScript errors
// @ts-expect-error - 'garbage' is not a valid arktype
defineNode({ ..., resultType: 'garbage' });

// @ts-expect-error - 'nubmer' is misspelled
defineNode({ ..., resultType: 'nubmer' });
```

#### Computed Union Result Types

For nodes where the result type depends on sub-expression types (like ternary), use a `UnionResultType`:

```typescript
import { defineNode, lhs, rhs, expr, constVal } from 'stringent';

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
  resultType: { union: ['then', 'else'] } as const,  // Union of then/else types
  eval: ({ condition, then: t, else: e }) => (condition ? t : e),
});

// When parsing "true ? 1 : 'hello'":
// - 'then' branch has outputSchema: 'number'
// - 'else' branch has outputSchema: 'string'
// - Result has outputSchema: 'number | string'
```

#### Precedence

Precedence determines operator binding strength:

- **Lower numbers** = lower precedence = binds **looser** = tried **first**
- **Higher numbers** = higher precedence = binds **tighter**

```typescript
// Precedence example: 1 + 2 * 3
// mul (precedence 2) binds tighter than add (precedence 1)
// Result: 1 + (2 * 3) = 7

const add = defineNode({
  name: "add",
  pattern: [lhs("number").as("left"), constVal("+"), rhs("number").as("right")],
  precedence: 1,  // Lower = looser binding
  resultType: "number",
});

const mul = defineNode({
  name: "mul",
  pattern: [lhs("number").as("left"), constVal("*"), rhs("number").as("right")],
  precedence: 2,  // Higher = tighter binding
  resultType: "number",
});
```

#### The configure Function

Transform parsed bindings before they become node fields:

```typescript
const ternary = defineNode({
  name: "ternary",
  pattern: [
    lhs("boolean").as("cond"),
    constVal("?"),
    expr().as("then"),
    constVal(":"),
    expr().as("else"),
  ],
  precedence: 0,
  resultType: "unknown",
  configure: ({ cond, then: thenBranch, else: elseBranch }) => ({
    condition: cond,
    consequent: thenBranch,
    alternate: elseBranch,
  }),
});
```

#### The eval Function

Evaluate the node to produce a runtime value:

```typescript
const add = defineNode({
  name: "add",
  pattern: [lhs("number").as("left"), constVal("+"), rhs("number").as("right")],
  precedence: 1,
  resultType: "number",
  eval: ({ left, right }) => left + right,  // left and right are typed as number!
});
```

The `eval` function receives **already-evaluated** values. For the expression `1 + 2`:
- `left` = `1` (number, not an AST node)
- `right` = `2` (number, not an AST node)

---

## Pattern Element Factories

Pattern elements define the syntax of a node. They are combined in a `pattern` array.

### Atom Factories

Atoms are terminal symbols that match literal values.

#### number()

Matches numeric literals (integers and decimals).

```typescript
const num = number();

// Matches: 42, 3.14, 0.5, .5, 5.
```

#### string(quotes)

Matches quoted string literals with escape sequence support.

```typescript
const str = string(['"', "'"]);

// Matches: "hello", 'world', "with \"escapes\""
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `quotes` | `readonly string[]` | Quote characters to recognize |

Supported escape sequences: `\n`, `\t`, `\r`, `\\`, `\"`, `\'`, `\0`, `\b`, `\f`, `\v`, `\xHH`, `\uHHHH`

#### ident()

Matches identifiers (variable names).

```typescript
const id = ident();

// Matches: foo, bar123, _private, $special
```

Identifiers resolve their types from the parse context:

```typescript
const result = parser.parse("x + y", { x: "number", y: "number" });
// x and y have outputSchema: "number"
```

#### nullLiteral()

Matches the `null` keyword.

```typescript
const nil = nullLiteral();

// Matches: null
// Does NOT match: nullable, nullify (these are identifiers)
```

#### booleanLiteral()

Matches `true` or `false` keywords.

```typescript
const bool = booleanLiteral();

// Matches: true, false
// Does NOT match: trueish, falsely (these are identifiers)
```

#### undefinedLiteral()

Matches the `undefined` keyword.

```typescript
const undef = undefinedLiteral();

// Matches: undefined
// Does NOT match: undefinedVar (this is an identifier)
```

#### constVal(value)

Matches an exact string (typically operators or keywords).

```typescript
const plus = constVal("+");
const arrow = constVal("=>");

// Matches the exact string only
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `value` | `string` | Exact string to match |

---

### Expression Factories

Expression elements are recursive - they match sub-expressions.

#### lhs(constraint?)

Creates a **LEFT-HAND SIDE** expression element.

Uses the **next precedence level** to avoid left-recursion. Must be at position 0 in a pattern.

```typescript
const add = defineNode({
  pattern: [lhs("number").as("left"), constVal("+"), rhs("number").as("right")],
  // ...
});
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `constraint` | `type.validate<T>?` | Optional type constraint validated by ArkType at compile-time |

**Constraint Validation:** The constraint is validated at compile-time using ArkType:

```typescript
// Valid constraints
lhs('number');           // Primitive
lhs('string.email');     // Subtype
lhs('number >= 0');      // Constrained
lhs('string | number');  // Union

// Invalid constraints cause TypeScript errors
// @ts-expect-error - 'garbage' is not a valid arktype
lhs('garbage');
```

#### rhs(constraint?)

Creates a **RIGHT-HAND SIDE** expression element.

Uses the **current precedence level** for right-associativity (`1+2+3` = `1+(2+3)`).

```typescript
const add = defineNode({
  pattern: [lhs("number").as("left"), constVal("+"), rhs("number").as("right")],
  // ...
});
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `constraint` | `type.validate<T>?` | Optional type constraint validated by ArkType at compile-time |

**Constraint Validation:** Same as `lhs()` - constraints are validated at compile-time.

#### expr(constraint?)

Creates a **FULL** expression element.

Resets to the full grammar - used for delimited contexts like parentheses or ternary branches.

```typescript
const parens = defineNode({
  name: "parentheses",
  pattern: [constVal("("), expr().as("inner"), constVal(")")],
  // expr() can contain ANY expression, including low-precedence operators
});

const ternary = defineNode({
  pattern: [
    lhs("boolean").as("cond"),
    constVal("?"),
    expr().as("then"),     // Can be any expression
    constVal(":"),
    expr().as("else"),     // Can be any expression
  ],
  // ...
});
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `constraint` | `type.validate<T>?` | Optional type constraint validated by ArkType at compile-time |

**Constraint Validation:** Same as `lhs()` - constraints are validated at compile-time.

---

### The .as() Method

All pattern element factories return a schema with an `.as(name)` method for capturing values.

```typescript
// Without .as() - value is not captured
lhs("number")

// With .as() - value is captured as "left"
lhs("number").as("left")
```

Named bindings are:
1. Passed to `configure()` as AST nodes
2. Passed to `eval()` as evaluated values
3. Added as fields on the result AST node

---

## Runtime Functions

### evaluate()

Evaluates a parsed AST node to produce a runtime value with **compile-time type inference** and **runtime ArkType validation**.

The return type is automatically inferred from the AST node's `outputSchema` field using ArkType's type inference:

| outputSchema | Return Type |
|--------------|-------------|
| `'number'` | `number` |
| `'string'` | `string` |
| `'boolean'` | `boolean` |
| `'null'` | `null` |
| `'undefined'` | `undefined` |
| `'string.email'` | `string` |
| `'number.integer'` | `number` |
| `'number >= 0'` | `number` |
| `'string \| number'` | `string \| number` |
| `'string[]'` | `string[]` |
| Other valid ArkType | Inferred via `type.infer<T>` |
| Invalid/unknown | `unknown` |

```typescript
function evaluate<T, TData extends ExtractRequiredData<T>>(
  ast: T,
  ctx: EvalContext<TData>
): SchemaToType<ExtractOutputSchema<T>>
```

#### Type Utilities

```typescript
// Extract outputSchema from an AST node type
type ExtractOutputSchema<T> = T extends { outputSchema: infer S extends string } ? S : 'unknown';

// Map schema string to TypeScript type using ArkType inference
type SchemaToType<T extends string> =
  // Fast path for common primitives
  T extends 'number' ? number :
  T extends 'string' ? string :
  T extends 'boolean' ? boolean :
  T extends 'null' ? null :
  T extends 'undefined' ? undefined :
  T extends 'unknown' ? unknown :
  // Use ArkType for advanced types (subtypes, constraints, unions, arrays)
  type.infer<T>;

// Extract required data types from AST identifiers
type ExtractRequiredData<T> = /* ... */;
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `ast` | `T` | The parsed AST node (generic, captures the node type) |
| `ctx` | `EvalContext` | Evaluation context with data and node schemas |

#### EvalContext

```typescript
interface EvalContext<TSchema extends Record<string, unknown> = Record<string, unknown>> {
  data: TSchema;              // Variable values
  nodes: readonly NodeSchema[]; // Node schemas with eval functions
}
```

#### Example

```typescript
const parser = createParser([numberLit, add, mul] as const);
const result = parser.parse("1+2*3", {});

if (result.length === 2) {
  const value = evaluate(result[0], {
    data: {},
    nodes: [numberLit, add, mul],
  });
  // TypeScript infers: value: number (from outputSchema: "number")
  console.log(value); // 7
}
```

#### Type Inference Example

```typescript
// The type flows through from parsing to evaluation
const add = defineNode({
  name: "add",
  pattern: [lhs("number").as("left"), constVal("+"), rhs("number").as("right")],
  precedence: 1,
  resultType: "number",  // This becomes outputSchema on the AST
  eval: ({ left, right }) => left + right,
});

const parser = createParser([add] as const);
const result = parser.parse("1 + 2", {});

if (result.length === 2) {
  // result[0] has type with outputSchema: "number"
  const value = evaluate(result[0], { data: {}, nodes: [add] });
  // value has type: number (not unknown!)

  // TypeScript will catch type errors:
  const doubled: number = value * 2;  // ✓ Works
  const upper: string = value.toUpperCase();  // ✗ Error: number has no toUpperCase
}
```

---

### createEvaluator()

Creates a bound evaluator function with pre-configured node schemas. The returned function preserves **compile-time type inference** just like `evaluate()`.

```typescript
function createEvaluator(nodes: readonly NodeSchema[]):
  <T, TData extends Record<string, unknown>>(ast: T, data: TData) => SchemaToType<ExtractOutputSchema<T>>
```

The returned evaluator function infers the return type from the AST's `outputSchema`:
- `outputSchema: "number"` → returns `number`
- `outputSchema: "string"` → returns `string`
- `outputSchema: "boolean"` → returns `boolean`
- etc.

#### Example

```typescript
const evaluator = createEvaluator([numberLit, add, mul]);

const result = parser.parse("1+2*3", {});
if (result.length === 2) {
  const value = evaluator(result[0], {});
  // TypeScript infers: value: number
  console.log(value); // 7
}

// With variables
const result2 = parser.parse("x+y", { x: "number", y: "number" });
if (result2.length === 2) {
  const value = evaluator(result2[0], { x: 10, y: 20 });
  // TypeScript infers: value: number
  console.log(value); // 30
}
```

#### Type Inference Example

```typescript
// Boolean expression
const gt = defineNode({
  name: "gt",
  pattern: [lhs("number").as("left"), constVal(">"), rhs("number").as("right")],
  precedence: 1,
  resultType: "boolean",
  eval: ({ left, right }) => left > right,
});

const evaluator = createEvaluator([gt]);
const result = parser.parse("5 > 3", {});

if (result.length === 2) {
  const isGreater = evaluator(result[0], {});
  // TypeScript infers: isGreater: boolean (not unknown!)

  if (isGreater) {
    console.log("5 is greater than 3");
  }
}
```

---

### infer()

Infers the output type from an AST node at runtime.

```typescript
function infer(ast: unknown): InferredType
```

#### Returns

One of: `"number"`, `"string"`, `"boolean"`, `"null"`, `"undefined"`, `"unknown"`, or `"invalid"`

#### Example

```typescript
const result = parser.parse("1+2", {});
if (result.length === 2) {
  const type = infer(result[0]);
  console.log(type); // "number"
}
```

---

### parseWithErrors()

Parse with detailed error information on failure.

```typescript
function parseWithErrors(
  nodes: readonly NodeSchema[],
  input: string,
  context: Context
): ParseWithErrorsResult
```

#### Returns

```typescript
interface ParseWithErrorsResult {
  success: boolean;
  ast?: ASTNode<string, unknown>;
  remaining?: string;
  error?: RichParseError;
  input: string;
}
```

#### RichParseError

```typescript
interface RichParseError {
  kind: ParseErrorKind;
  message: string;
  position: SourcePosition;
  snippet: string;
  input: string;
  context?: ErrorContext;
}

interface SourcePosition {
  offset: number;   // 0-based character offset
  line: number;     // 1-based line number
  column: number;   // 1-based column number
}
```

#### Example

```typescript
const result = parseWithErrors([add, mul], "1+", {});

if (!result.success && result.error) {
  console.log(result.error.message);
  // "No grammar rule matched at position 2"

  console.log(formatParseError(result.error));
  // "Error at line 1, column 3: No grammar rule matched
  //  1+
  //    →"
}
```

---

## ArkType Integration

Stringent uses [ArkType](https://arktype.io/) for both compile-time and runtime type validation. This section documents how ArkType is integrated throughout the library.

### Supported Types

Stringent supports the full range of ArkType type definitions:

| Category | Examples | TypeScript Inference |
|----------|----------|---------------------|
| **Primitives** | `'number'`, `'string'`, `'boolean'`, `'null'`, `'undefined'` | Direct mapping |
| **Subtypes** | `'string.email'`, `'string.uuid'`, `'string.url'`, `'number.integer'` | Base type (`string`, `number`) |
| **Constraints** | `'number >= 0'`, `'number > 0'`, `'1 <= number <= 100'`, `'string >= 8'` | Base type |
| **Unions** | `'string \| number'`, `'boolean \| null'` | Union type |
| **Arrays** | `'string[]'`, `'number[]'`, `'(string \| number)[]'` | Array type |

### Compile-Time Validation

#### Schema Validation in `parser.parse()`

Schema types passed to `parse()` are validated at compile-time:

```typescript
const parser = createParser([add] as const);

// Valid - all these are valid ArkType strings
parser.parse('x + y', { x: 'number', y: 'number' });        // Primitives
parser.parse('x + y', { x: 'number >= 0', y: 'number' });   // Constraints
parser.parse('email', { email: 'string.email' });           // Subtypes

// Invalid - TypeScript errors at compile time
// @ts-expect-error - 'garbage' is not a valid arktype
parser.parse('x', { x: 'garbage' });

// @ts-expect-error - 'nubmer' is misspelled
parser.parse('x', { x: 'nubmer' });
```

#### Constraint Validation in `lhs()`, `rhs()`, `expr()`

```typescript
// Valid constraints
lhs('number');           // OK
lhs('string.email');     // OK
lhs('number >= 0');      // OK

// @ts-expect-error - Invalid constraint
lhs('garbage');
```

#### resultType Validation in `defineNode()`

```typescript
// Valid result types
defineNode({ ..., resultType: 'number' });
defineNode({ ..., resultType: 'string | number' });

// @ts-expect-error - Invalid result type
defineNode({ ..., resultType: 'garbage' });
```

### Runtime Validation

When `evaluate()` is called, ArkType validates identifier values against their schemas at runtime:

```typescript
const result = parser.parse('x', { x: 'number >= 0' });

if (result.length === 2) {
  // Works - 5 is >= 0
  evaluate(result[0], { data: { x: 5 }, nodes: [] });

  // Throws at runtime: "Variable 'x' failed validation for schema 'number >= 0'"
  evaluate(result[0], { data: { x: -5 }, nodes: [] });
}
```

#### Subtype Validation

```typescript
const result = parser.parse('email', { email: 'string.email' });

// Works - valid email format
evaluate(result[0], { data: { email: 'test@example.com' }, nodes: [] });

// Throws - invalid email format
evaluate(result[0], { data: { email: 'not-an-email' }, nodes: [] });
```

#### Type Validation

```typescript
const result = parser.parse('x', { x: 'number' });

// Works - correct type
evaluate(result[0], { data: { x: 42 }, nodes: [] });

// Throws - wrong type (string instead of number)
evaluate(result[0], { data: { x: 'wrong' }, nodes: [] });
```

### Computed Result Types

For nodes where the result type depends on sub-expressions, use `UnionResultType`:

```typescript
interface UnionResultType<TBindings extends readonly string[] = readonly string[]> {
  readonly union: TBindings;
}

// Example: ternary operator
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
  resultType: { union: ['then', 'else'] } as const,
  eval: ({ condition, then: t, else: e }) => (condition ? t : e),
});
```

When parsing `true ? 1 : "hello"`:
- `then` branch has `outputSchema: 'number'`
- `else` branch has `outputSchema: 'string'`
- Result has `outputSchema: 'number | string'`
- `evaluate()` returns type `number | string`

#### Single-Binding Propagation

For nodes with `resultType: 'unknown'` and exactly one binding (like parentheses), the `outputSchema` is automatically propagated from the inner expression:

```typescript
// (1 + 2) - parentheses node
// Inner expression has outputSchema: 'number'
// Result has outputSchema: 'number' (propagated)

const result = parser.parse('(1 + 2)', {});
const value = evaluate(result[0], ctx);
// TypeScript infers: value is number
```

---

## Types

### Parser

The parser interface returned by `createParser()`.

```typescript
interface Parser<TGrammar extends Grammar, TNodes extends readonly NodeSchema[]> {
  parse<TInput extends string, TSchema extends Record<string, string>>(
    input: ValidatedInput<TGrammar, TInput, Context<TSchema>>,
    schema: TSchema
  ): Parse<TGrammar, TInput, Context<TSchema>>;

  readonly nodes: TNodes;
}
```

The `ValidatedInput` type ensures that only valid expressions are accepted at compile-time.

---

### NodeSchema

A node definition schema.

```typescript
interface NodeSchema<
  TName extends string = string,
  TPattern extends readonly PatternSchema[] = readonly PatternSchema[],
  TPrecedence extends Precedence = Precedence,
  TResultType extends string = string
> {
  readonly name: TName;
  readonly pattern: TPattern;
  readonly precedence: TPrecedence;
  readonly resultType: TResultType;
  readonly configure?: ConfigureFn;
  readonly eval?: EvalFn;
}
```

---

### Context

Parse context for identifier type resolution.

```typescript
interface Context<TData extends Record<string, string> = Record<string, string>> {
  readonly data: TData;
}

// Empty context (no variables)
const emptyContext: Context<{}> = { data: {} };
type EmptyContext = Context<{}>;
```

#### Example

```typescript
// Define a context where x and y are numbers
type MyContext = Context<{ x: "number"; y: "number" }>;

// When parsing "x + y", identifiers resolve their types from context
```

---

### Grammar

A grammar is a tuple of precedence levels, sorted from lowest to highest precedence.

```typescript
type Grammar = readonly (readonly NodeSchema[])[];
```

Built-in atoms (number, string, identifier, etc.) are automatically appended as the final level.

---

### AST Node Types

#### ASTNode

Base interface for all AST nodes.

```typescript
interface ASTNode<TType extends string = string, TOutputSchema = unknown> {
  node: TType;
  outputSchema: TOutputSchema;
}
```

#### NumberNode

```typescript
type NumberNode<TValue extends string = string> = ASTNode<"literal", "number"> & {
  raw: TValue;
  value: number;  // Computed from raw
};
```

#### StringNode

```typescript
type StringNode<TValue extends string = string> = ASTNode<"literal", "string"> & {
  raw: TValue;
  value: TValue;  // With escape sequences processed
};
```

#### BooleanNode

```typescript
type BooleanNode<TValue extends string = string> = ASTNode<"literal", "boolean"> & {
  raw: TValue;
  value: TValue extends "true" ? true : false;
};
```

#### NullNode

```typescript
type NullNode = ASTNode<"literal", "null"> & {
  raw: "null";
  value: null;
};
```

#### UndefinedNode

```typescript
type UndefinedNode = ASTNode<"literal", "undefined"> & {
  raw: "undefined";
  value: undefined;
};
```

#### IdentNode

```typescript
interface IdentNode<TName extends string = string, TOutputSchema = "unknown">
  extends ASTNode<"identifier", TOutputSchema> {
  name: TName;
}
```

#### BinaryNode

Binary operations have left/right children.

```typescript
interface BinaryNode<
  TName extends string = string,
  TLeft = unknown,
  TRight = unknown,
  TOutputSchema extends string = string
> {
  readonly node: TName;
  readonly outputSchema: TOutputSchema;
  readonly left: TLeft;
  readonly right: TRight;
}
```

---

## Error Handling

### Error Types

#### ParseError (Type-Level)

```typescript
interface ParseError<TMessage extends string = string> {
  readonly __error: true;
  readonly message: TMessage;
}
```

#### TypeMismatchError

```typescript
type TypeMismatchError<TExpected extends string, TActual extends string> =
  ParseError<`Type mismatch: expected ${TExpected}, got ${TActual}`>;
```

#### NoMatchError

```typescript
type NoMatchError = ParseError<"No grammar rule matched">;
```

#### RichParseError (Runtime)

Detailed runtime error with position information.

```typescript
interface RichParseError {
  kind: ParseErrorKind;
  message: string;
  position: SourcePosition;
  snippet: string;
  input: string;
  context?: ErrorContext;
}

type ParseErrorKind =
  | 'no_match'
  | 'type_mismatch'
  | 'unterminated_string'
  | 'unclosed_paren'
  | 'unexpected_token'
  | 'empty_input';
```

---

### Error Utilities

#### calculatePosition()

Convert a character offset to line/column.

```typescript
function calculatePosition(input: string, offset: number): SourcePosition
```

#### createSnippet()

Create a visual snippet showing the error position.

```typescript
function createSnippet(input: string, offset: number): string
```

#### formatParseError()

Format a single error for display.

```typescript
function formatParseError(error: RichParseError): string
```

#### formatErrors()

Format multiple errors for display.

```typescript
function formatErrors(errors: RichParseError[]): string
```

#### Error Factories

```typescript
function noMatchError(input: string, offset: number): RichParseError
function typeMismatchError(input: string, offset: number, expected: string, actual: string): RichParseError
function unterminatedStringError(input: string, offset: number): RichParseError
function unclosedParenError(input: string, offset: number): RichParseError
function unexpectedTokenError(input: string, offset: number, token: string): RichParseError
function emptyInputError(): RichParseError
```

---

## Type-Level Utilities

### Parse<Grammar, Input, Context>

The main type-level parse type.

```typescript
type Parse<TGrammar extends Grammar, TInput extends string, TContext extends Context> =
  ParseLevels<TGrammar, TInput, TContext, TGrammar>;
```

Returns:
- `[ASTNode, ""]` on successful complete parse
- `[ASTNode, RemainingInput]` on partial parse
- `[]` on no match

### Infer<T>

Infer the output type from an AST node at the type level.

```typescript
type Infer<T> = T extends { outputSchema: infer S } ? S : never;
```

### ComputeGrammar<Nodes>

Compute the grammar type from node schemas.

```typescript
type ComputeGrammar<TNodes extends readonly NodeSchema[]> =
  readonly [...OperatorLevels, BuiltInAtoms];
```

### SchemaToType<T>

Map an ArkType type string to its TypeScript type using ArkType's inference.

```typescript
type SchemaToType<T extends string> =
  // Fast path for common primitives
  T extends 'number' ? number :
  T extends 'string' ? string :
  T extends 'boolean' ? boolean :
  T extends 'null' ? null :
  T extends 'undefined' ? undefined :
  T extends 'unknown' ? unknown :
  // Use ArkType for advanced types (subtypes, constraints, unions, arrays)
  type.infer<T>;

// Examples:
// SchemaToType<'number'>           → number
// SchemaToType<'string'>           → string
// SchemaToType<'string.email'>     → string
// SchemaToType<'number >= 0'>      → number
// SchemaToType<'string | number'>  → string | number
// SchemaToType<'string[]'>         → string[]
// SchemaToType<'garbage'>          → unknown (invalid types fallback)
```

### ValidArkType<T>

Validate that a string is a valid ArkType type at compile-time.

```typescript
type ValidArkType<T extends string> = type.validate<T>;

// Used in function parameters to validate type strings:
function example<const T extends string>(schema: type.validate<T>) { ... }

// Valid types pass through unchanged
// Invalid types cause TypeScript compile errors
```

### UnionResultType<TBindings>

Marker type for computed union result types in `defineNode()`.

```typescript
interface UnionResultType<TBindings extends readonly string[] = readonly string[]> {
  readonly union: TBindings;
}

// Usage in defineNode:
defineNode({
  // ...
  resultType: { union: ['then', 'else'] } as const,
});
```

### InferBindings<Pattern>

Infer the bindings type from a pattern (AST nodes for `configure()`).

```typescript
type InferBindings<TPattern extends readonly PatternSchema[]> = {
  [K in ExtractNamedSchemas<TPattern> as K["name"]]: InferNodeType<K["schema"]>;
};
```

### InferEvaluatedBindings<Pattern>

Infer the evaluated bindings type from a pattern (runtime values for `eval()`).

```typescript
type InferEvaluatedBindings<TPattern extends readonly PatternSchema[]> = {
  [K in ExtractNamedSchemas<TPattern> as K["name"]]: InferEvaluatedType<K["schema"]>;
};
```
