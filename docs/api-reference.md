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
| `resultType` | `string` | The output type (e.g., `"number"`, `"string"`, `"boolean"`) |
| `configure` | `(bindings, ctx) => object` | Optional. Transform parsed bindings into node fields |
| `eval` | `(values, ctx) => value` | Optional. Evaluate the node to produce a runtime value |

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
| `constraint` | `string?` | Optional type constraint (e.g., `"number"`, `"string"`) |

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
| `constraint` | `string?` | Optional type constraint |

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
| `constraint` | `string?` | Optional type constraint |

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

Evaluates a parsed AST node to produce a runtime value.

```typescript
function evaluate(ast: unknown, ctx: EvalContext): unknown
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `ast` | `unknown` | The parsed AST node |
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
  console.log(value); // 7
}
```

---

### createEvaluator()

Creates a bound evaluator function with pre-configured node schemas.

```typescript
function createEvaluator(nodes: readonly NodeSchema[]):
  <TData extends Record<string, unknown>>(ast: unknown, data: TData) => unknown
```

#### Example

```typescript
const evaluator = createEvaluator([numberLit, add, mul]);

const result = parser.parse("1+2*3", {});
if (result.length === 2) {
  const value = evaluator(result[0], {});
  console.log(value); // 7
}

// With variables
const result2 = parser.parse("x+y", { x: "number", y: "number" });
if (result2.length === 2) {
  const value = evaluator(result2[0], { x: 10, y: 20 });
  console.log(value); // 30
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

Map a type string to its TypeScript type.

```typescript
type SchemaToType<T extends string> =
  T extends "number" ? number :
  T extends "string" ? string :
  T extends "boolean" ? boolean :
  T extends "null" ? null :
  T extends "undefined" ? undefined :
  unknown;
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
