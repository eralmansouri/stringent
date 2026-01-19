# Stringent v2 - Type Inference Fix

## READ THIS FIRST

**DO NOT WRITE A SINGLE LINE OF CODE** until you can explain, in your own words:
1. What makes this library different from a regular expression parser
2. Why returning `unknown` from `evaluate()` defeats the entire purpose
3. How TypeScript's type system can infer return types from input types

If you cannot explain these things, you are not ready to work on this codebase. Read the existing code. Read the tests. Understand the patterns. Then come back.

---

## What Is Stringent?

Stringent is a **compile-time type-safe** expression parser for TypeScript.

There are thousands of expression parsers. What makes Stringent special is that **the types flow through everything**. When you parse `"1 + 2"`, TypeScript knows at compile time that the result is a number. When you parse `"true && false"`, TypeScript knows it's a boolean. When you parse `"hello" ++ "world"`, TypeScript knows it's a string.

This is not about runtime. Runtime is easy. Any JavaScript can evaluate `1 + 2`. The hard part - the ENTIRE VALUE OF THIS LIBRARY - is that TypeScript's type system tracks the types through parsing and evaluation.

---

## The Problem We Need to Fix

Currently, `evaluate()` returns `unknown`:

```typescript
const parser = createParser([addNode, mulNode] as const);
const result = parser.parse('1 + 2', {});

// result[0] has type: BinaryNode<"add", NumberNode, NumberNode, "number">
// The AST knows its outputSchema is "number"

const value = evaluate(result[0], ctx);
// value has type: unknown
// THIS IS WRONG. It should be: number
```

The AST node **already carries its type information** in the `outputSchema` field. The `evaluate` function just throws that information away and returns `unknown`.

This defeats the entire purpose of the library.

---

## What Success Looks Like

After fixing this, the following should work:

### Example 1: Basic Arithmetic
```typescript
const parser = createParser([
  defineNode({
    name: 'add',
    pattern: [lhs('number').as('left'), constVal('+'), rhs('number').as('right')],
    precedence: 1,
    resultType: 'number',
    eval: ({ left, right }) => left + right,
  }),
] as const);

const result = parser.parse('1 + 2', {});
const value = evaluate(result[0], ctx);

// TypeScript should know: typeof value === number
// NOT unknown
```

### Example 2: Boolean Operations
```typescript
const parser = createParser([
  defineNode({
    name: 'and',
    pattern: [lhs('boolean').as('left'), constVal('&&'), rhs('boolean').as('right')],
    precedence: 1,
    resultType: 'boolean',
    eval: ({ left, right }) => left && right,
  }),
] as const);

const result = parser.parse('true && false', {});
const value = evaluate(result[0], ctx);

// TypeScript should know: typeof value === boolean
```

### Example 3: String Concatenation
```typescript
const parser = createParser([
  defineNode({
    name: 'concat',
    pattern: [lhs('string').as('left'), constVal('++'), rhs('string').as('right')],
    precedence: 1,
    resultType: 'string',
    eval: ({ left, right }) => left + right,
  }),
] as const);

const result = parser.parse('"hello" ++ "world"', {});
const value = evaluate(result[0], ctx);

// TypeScript should know: typeof value === string
```

### Example 4: Mixed Types (Comparison)
```typescript
const parser = createParser([
  defineNode({
    name: 'eq',
    pattern: [lhs('number').as('left'), constVal('=='), rhs('number').as('right')],
    precedence: 1,
    resultType: 'boolean',  // Numbers in, BOOLEAN out
    eval: ({ left, right }) => left === right,
  }),
] as const);

const result = parser.parse('1 == 2', {});
const value = evaluate(result[0], ctx);

// TypeScript should know: typeof value === boolean
// Even though the operands are numbers, the RESULT is boolean
```

### Example 5: The Type Comes From the AST
```typescript
// This is the key insight: the AST node carries its type
type MyAST = BinaryNode<"add", NumberNode, NumberNode, "number">;
//                                                      ^^^^^^^^
//                                          This "number" is the outputSchema

// When you call evaluate() on this AST, the return type should be `number`
// because the AST's outputSchema is "number"

// The evaluate function should be generic over the AST type
// and use the outputSchema to determine the return type
```

---

## What NOT to Do

1. **Do not just add type assertions.** `return result as number` is not a fix. The types must flow naturally.

2. **Do not break the runtime behavior.** The evaluate function works correctly at runtime. We're fixing the types, not the logic.

3. **Do not ignore edge cases.** What happens when `outputSchema` is not a known type? What about nested expressions?

4. **Do not copy-paste solutions.** Understand WHY the fix works. If you can't explain it, you don't understand it.

---

## Tasks

### Task 1: Understand the Codebase

**DO NOT SKIP THIS TASK.**

Before writing any code, you must be able to answer:

- [ ] What is the `outputSchema` field on AST nodes? Where does it come from?
- [ ] How does `parser.parse()` preserve type information from input to output?
- [ ] What existing type utilities does the codebase have for mapping schema strings to TypeScript types?
- [ ] Why does the current `evaluate()` function lose type information?

Write your answers in `progress.txt`. If you cannot answer these questions, keep reading the code until you can.

**Files to study:**
- `src/createParser.ts` - How the parser preserves types
- `src/parse/index.ts` - How parsing infers output types
- `src/schema/index.ts` - The `SchemaToType` utility and related types
- `src/static/infer.ts` - The `Infer` type
- `src/runtime/eval.ts` - The current (broken) evaluate function
- `src/primitive/index.ts` - AST node types with `outputSchema`

### Task 2: Fix `evaluate()` Return Type

- [x] `evaluate()` returns `number` when AST has `outputSchema: "number"`
- [x] `evaluate()` returns `string` when AST has `outputSchema: "string"`
- [x] `evaluate()` returns `boolean` when AST has `outputSchema: "boolean"`
- [x] `evaluate()` returns `null` when AST has `outputSchema: "null"`
- [x] `evaluate()` returns `undefined` when AST has `outputSchema: "undefined"`
- [x] `evaluate()` returns `unknown` for unknown outputSchema
- [x] Runtime behavior unchanged (all existing tests pass)

**Do not change the runtime behavior.** The function already works correctly. You are only fixing the TypeScript types.

### Task 3: Fix `createEvaluator()` Return Type

- [x] `createEvaluator()` returns a function with proper return type inference
- [x] The returned evaluator infers types the same way `evaluate()` does

### Task 4: Add Type-Level Tests

Create tests that verify the TYPE inference works, not just the runtime behavior.

**Example of a type-level test:**
```typescript
import { expectTypeOf } from 'vitest';

it('evaluate returns number for number outputSchema', () => {
  const ast = { node: 'literal', value: 42, outputSchema: 'number' } as const;
  const result = evaluate(ast, ctx);

  // This is a TYPE assertion, not a runtime assertion
  expectTypeOf(result).toEqualTypeOf<number>();
});
```

- [x] Type tests for `evaluate()` with all primitive types (number, string, boolean, null, undefined)
- [x] Type tests for `evaluate()` with parsed expressions from `parser.parse()`
- [x] Type tests for `evaluate()` with nested expressions
- [x] Type tests for `createEvaluator()` helper

### Task 5: Update Documentation

- [x] Update README to show type-safe evaluation examples
- [x] Update API reference (`docs/api-reference.md`) with correct return types
- [x] Add examples showing compile-time type inference in action

---

## Acceptance Criteria

The fix is complete when:

1. `evaluate(ast, ctx)` returns the correct TypeScript type based on `ast.outputSchema`
2. `createEvaluator(nodes)(ast, data)` returns the correct TypeScript type
3. All existing tests still pass (runtime behavior unchanged)
4. New type-level tests verify the type inference
5. No use of `any` or unsafe type assertions in the fix
6. The fix is documented with examples

---

## Remember

The runtime already works. We're not fixing bugs in the evaluation logic. We're fixing the TypeScript types so that the compile-time type safety - THE ENTIRE POINT OF THIS LIBRARY - actually works.

If your fix involves `as any` or `as unknown` or ignoring type errors, you have not fixed the problem. You have hidden it.

Understand first. Then code.
