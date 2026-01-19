# Stringent - Type Safety Overhaul with ArkType Integration

## READ THIS FIRST

This library claims to be a **"compile-time type-safe expression parser"** but has fundamental type safety gaps. The implementation agent completely missed the point.

**DO NOT WRITE CODE** until you can answer these questions:

1. What is arktype and why does it matter here?
2. What is the difference between a TYPE SCHEMA (parse-time) and actual DATA (eval-time)?
3. How should these two be connected?
4. Why is `{ x: 'garbage' }` currently accepted as a schema?

If you cannot answer these, read the code until you can.

---

## The Vision

Stringent is a type-safe expression parser where:

1. **Schema types use arktype** - Not hardcoded primitives, but any valid arktype type string
2. **Parse output is typed** - The AST carries type information from the grammar
3. **Eval data matches schema** - Data passed to evaluate must match the schema from parsing
4. **Eval output is typed** - The return type matches the AST's output type

Currently, only #2 and #4 partially work. #1 and #3 are completely broken.

---

## What Is ArkType?

ArkType is a runtime TypeScript validation library with 1:1 type syntax. It lets you write:

```typescript
import { type } from "arktype";

const User = type({
  name: "string",
  age: "number >= 0",
  email: "string.email",
});

type User = typeof User.infer; // Extract TS type
```

ArkType validates at both compile-time AND runtime. It supports:
- Primitives: `"string"`, `"number"`, `"boolean"`, `"null"`, `"undefined"`
- Subtypes: `"string.email"`, `"number.integer"`, `"string.uuid"`
- Constraints: `"number > 0"`, `"string >= 8"`, `"1 <= number <= 100"`
- Unions: `"string | number"`
- Arrays: `"string[]"`, `"number[][]"`
- Objects: `{ name: "string", "age?": "number" }`
- And much more

**The key insight:** ArkType can validate that a string is a valid type definition at compile time using generics.

---

## The Current Gaps

### GAP 1: Schema Type Strings Accept Anything

**Current code (src/createParser.ts:41-44):**
```typescript
parse<TInput extends string, TSchema extends Record<string, string>>(
  input: ValidatedInput<TGrammar, TInput, Context<TSchema>>,
  schema: TSchema
): Parse<TGrammar, TInput, Context<TSchema>>;
```

`TSchema extends Record<string, string>` accepts ANY string value.

```typescript
// ALL of these compile with NO errors:
parser.parse('x + 1', { x: 'number' });      // ✓ Valid
parser.parse('x + 1', { x: 'garbage' });     // ✗ Should error
parser.parse('x + 1', { x: 'asdfghjkl' });   // ✗ Should error
```

**The fix:** Use arktype to validate schema type strings.

### GAP 2: Constraint Types Accept Anything

**Current code (src/schema/index.ts:169-174):**
```typescript
export const lhs = <const TConstraint extends string>(constraint?: TConstraint) =>
  withAs<ExprSchema<TConstraint, 'lhs'>>({
    kind: 'expr',
    constraint: constraint,
    role: 'lhs',
  });
```

`TConstraint extends string` accepts ANY string.

```typescript
// ALL of these compile:
lhs('number');      // ✓ Valid
lhs('garbage');     // ✗ Should error
lhs('asdfghjkl');   // ✗ Should error
```

There's even a comment in the code (line 64) that says:
> using arktype.type.validate<> (see createBox example: https://arktype.io/docs/generics)

**This was intended to use arktype but never implemented.**

### GAP 3: No Connection Between Parse Schema and Eval Data

This is the **critical gap**.

**Parse time:**
```typescript
const result = parser.parse('x + y', { x: 'number', y: 'string' });
// Schema says: x is number, y is string
```

**Eval time:**
```typescript
evaluate(result[0], {
  data: { x: "wrong", y: 123, z: true },  // ALL WRONG TYPES!
  nodes
});
// TypeScript: "looks good to me!" ✗
```

The `EvalContext.data` is typed as `Record<string, unknown>`. There's **zero connection** to the parse schema.

### GAP 4: Evaluate Return Type Doesn't Work with ArkType

**Current code (src/runtime/eval.ts):**
```typescript
export function evaluate<T>(ast: T, ctx: EvalContext): SchemaToType<ExtractOutputSchema<T>>
```

`SchemaToType` only handles 5 hardcoded types. What happens with arktype types?

```typescript
// Schema says x is 'string.email'
const result = parser.parse('x', { x: 'string.email' });
const value = evaluate(result[0], { data: { x: 'test@example.com' }, nodes });

// What is the type of `value`?
// Currently: unknown (because SchemaToType doesn't know 'string.email')
// Should be: string
```

`evaluate()` must use arktype to infer the return type from ANY valid arktype schema string.

### GAP 5: Computed Result Types (Ternary, Unions)

This is a **hard problem**. Some nodes don't have a fixed result type - it depends on the branches.

**Example: Ternary**
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
  precedence: 1,
  resultType: '???',  // What goes here?
});
```

What is the result type of `x ? true : 0`?
- The `then` branch has `outputSchema: 'boolean'`
- The `else` branch has `outputSchema: 'number'`
- The result should be `boolean | number`

**Current behavior:**
```typescript
resultType: 'unknown'  // Cop-out that defeats type safety
```

**Expected behavior:**
The result type should be COMPUTED from the branch types at parse time:
```typescript
// x ? true : 0
// then.outputSchema = 'boolean'
// else.outputSchema = 'number'
// result.outputSchema = 'boolean | number'

const value = evaluate(ast, ctx);
// typeof value should be: boolean | number
```

This requires:
1. A way to express "result type depends on branch types" in node definition
2. Type-level computation of the union at parse time
3. Runtime propagation of the computed outputSchema

### GAP 6: Type/Runtime Mismatch for Computed outputSchema

The runtime ALREADY computes outputSchema for single-binding nodes (like parentheses):

**Runtime (src/runtime/parser.ts:599-612):**
```typescript
if (outputSchema === 'unknown') {
  const bindingKeys = Object.keys(bindings);
  if (bindingKeys.length === 1) {
    outputSchema = singleBinding.outputSchema;  // Propagates!
  }
}
```

**Type-level (src/parse/index.ts:594):**
```typescript
readonly outputSchema: TNode['resultType'];  // Always static!
```

**The mismatch:**
```typescript
// Expression: (1 + 2)
// Runtime:    outputSchema = 'number' (propagated from inner)
// Type-level: outputSchema = 'unknown' (static from parentheses.resultType)
```

The type-level `BuildNodeResult` must match the runtime behavior:
- If `resultType` is `'unknown'` and there's exactly one binding, propagate that binding's outputSchema
- For ternary (two bindings), compute the union

---

## What Success Looks Like

After fixing all gaps:

```typescript
import { createParser, defineNode, lhs, rhs, constVal, evaluate } from 'stringent';

// 1. Schema types are validated via arktype
const add = defineNode({
  name: 'add',
  pattern: [lhs('number').as('left'), constVal('+'), rhs('number').as('right')],
  precedence: 1,
  resultType: 'number',
  eval: ({ left, right }) => left + right,
});

const parser = createParser([add] as const);

// 2. Parse schema accepts only valid arktype types
const result = parser.parse('x + 1', { x: 'number' });  // ✓
// parser.parse('x + 1', { x: 'garbage' });  // ✗ Type error!
// parser.parse('x + 1', { x: 'string.email' });  // ✓ Valid arktype!

// 3. Eval data must match parse schema types
const value = evaluate(result[0], {
  data: { x: 5 },  // ✓ x is number as required
  nodes: [add]
});
// evaluate(result[0], { data: { x: "wrong" }, nodes: [add] });  // ✗ Type error!
// evaluate(result[0], { data: { }, nodes: [add] });  // ✗ Type error - missing x!

// 4. Return type is inferred
const n: number = value;  // ✓ TypeScript knows value is number
```

---

## Tasks

### Task 1: Study ArkType Integration (COMPLETED)

Before writing any code, understand:

- [x] How does arktype's generic validation work? (See SKILL.md, ADVANCED.md)
- [x] How can we validate that a string is a valid arktype type at compile time?
- [x] How does `type.infer` work to extract TypeScript types from arktype definitions?
- [x] What arktype types should Stringent support initially?

Read these resources:
- `/Users/mansouri/Repositories/arktype-marketplace/skills/arktype/SKILL.md`
- `/Users/mansouri/Repositories/arktype-marketplace/skills/arktype/ADVANCED.md`
- `/Users/mansouri/Repositories/arktype-marketplace/skills/arktype/KEYWORDS.md`
- The comment at `src/schema/index.ts:64` that references arktype

**Findings documented in `src/arktype-research.test.ts`:**
1. `type('number')` creates a Type object that validates at runtime
2. `type.validate<def>` validates type strings at compile time in generic functions
3. `typeof type('...').infer` extracts the TypeScript type from a definition
4. Stringent should support: primitives, unions, subtypes (string.email), constraints (number >= 0)

### Task 2: Create Type Validation Using ArkType (COMPLETED)

Replace the hardcoded `SchemaToType` with arktype-based validation.

**Current (broken):**
```typescript
export type SchemaToType<T extends string> = T extends 'number'
  ? number
  : T extends 'string'
    ? string
    : // ... only 5 types
      : unknown;
```

**Goal:** Use arktype so that:
- `"number"` → `number`
- `"string"` → `string`
- `"string.email"` → `string` (subtype)
- `"number >= 0"` → `number` (constrained)
- `"string | number"` → `string | number` (union)
- `"garbage"` → compile error

- [x] Integrate arktype's type inference
- [x] Validate constraint strings at compile time
- [x] Support arktype subtypes (string.email, number.integer, etc.)
- [x] Support arktype constraints (number > 0, string >= 8, etc.)

**Implementation Notes:**
- `SchemaToType<T>` now uses arktype's `type.infer<T>` for advanced types
- Fast path for common primitives ('number', 'string', 'boolean', etc.) to avoid deep type instantiation
- `ValidArkType<T>` provides compile-time validation via `type.validate<T>`
- `ArkTypeSchemaToType<T>` is a direct wrapper around `type.infer<T>` (returns `never` for invalid)
- Fallback to `unknown` for invalid types to maintain backwards compatibility
- Tests added in `src/schema/arktype-integration.test.ts` (32 tests)

### Task 3: Fix Schema Validation in ExprSchema Factories (COMPLETED)

Update `lhs()`, `rhs()`, `expr()` to validate constraints via arktype.

- [x] Change constraint validation to use arktype
- [x] Verify that `lhs('garbage')` causes a type error
- [x] Verify that `lhs('string.email')` works
- [x] Update tests

**Implementation Notes:**
- Updated `lhs()`, `rhs()`, and `expr()` to use `type.validate<TConstraint>` for compile-time validation
- Invalid type strings like 'garbage', 'asdfghjkl' now cause TypeScript errors
- Valid arktype types work: primitives, subtypes (string.email), constraints (number >= 0), unions
- Added 34 tests in `src/schema/constraint-validation.test.ts`
- Changed import from `import type { type }` to `import { type }` to access `type.validate`

### Task 4: Fix Schema Validation in defineNode (COMPLETED)

Update `defineNode()` to validate `resultType` via arktype.

- [x] Change resultType validation to use arktype
- [x] Verify that `resultType: 'garbage'` causes a type error
- [x] Verify that `resultType: 'string | number'` works
- [x] Update tests

**Implementation Notes:**
- Updated `defineNode()` to use `type.validate<TResultType>` for the `resultType` parameter
- Invalid type strings like 'garbage', 'asdfghjkl', 'nubmer' now cause TypeScript errors
- Valid arktype types work: primitives, subtypes (string.email), constraints (number >= 0), unions
- Added 10 tests in `src/schema/constraint-validation.test.ts` under "defineNode() resultType validation (Task 4)"

### Task 5: Fix Schema Validation in parser.parse() (COMPLETED)

Update the parse method to validate schema types via arktype.

- [x] Change schema validation to use arktype
- [x] Verify that `parser.parse('x', { x: 'garbage' })` causes a type error
- [x] Verify that `parser.parse('x', { x: 'string.email' })` works
- [x] Update tests

**Implementation Notes:**
- Added `ValidatedSchema<TSchema>` type that validates each schema value using `type.validate`
- Updated `Parser.parse()` interface and `createParser()` implementation to use `ValidatedSchema<TSchema>`
- For literal string types, validation uses `type.validate<T>` (causes compile error for invalid types)
- For generic `string` types, validation is skipped to avoid deep type instantiation issues
- Added 34 tests in `src/createParser.schema-validation.test.ts`

### Task 6: Connect Parse Schema to Eval Data

This is the critical fix. The evaluate function must ensure data matches the schema.

**The problem:**
```typescript
// Parse says x is 'number'
const result = parser.parse('x + 1', { x: 'number' });

// But eval accepts ANY data
evaluate(result[0], { data: { x: "string value" }, nodes });  // No error!
```

**The solution:** The evaluator needs to know the schema and validate data against it.

Options to consider:
1. Carry schema in the parse result, require it in evaluate
2. Use arktype to validate data at runtime
3. Type-level connection between schema and data types

- [x] Design the connection approach
- [x] Implement schema-data type checking
- [x] Verify wrong data types cause type errors
- [x] Verify missing variables cause type errors
- [ ] Add runtime validation using arktype (deferred - requires arktype integration from Tasks 1-5)
- [x] Update tests

### Task 7: Add Type-Level and Runtime Tests

Create comprehensive tests for the type safety.

```typescript
import { expectTypeOf } from 'vitest';

describe('schema validation', () => {
  it('rejects invalid schema types', () => {
    // @ts-expect-error - 'garbage' is not a valid arktype
    parser.parse('x', { x: 'garbage' });
  });

  it('accepts valid arktype types', () => {
    // All of these should compile
    parser.parse('x', { x: 'number' });
    parser.parse('x', { x: 'string.email' });
    parser.parse('x', { x: 'number >= 0' });
  });
});

describe('data validation', () => {
  it('requires correct data types', () => {
    const result = parser.parse('x', { x: 'number' });

    // @ts-expect-error - x should be number, not string
    evaluate(result[0], { data: { x: "wrong" }, nodes });
  });

  it('validates at runtime', () => {
    const result = parser.parse('x', { x: 'number >= 0' });

    // Should throw at runtime
    expect(() => {
      evaluate(result[0], { data: { x: -5 }, nodes });
    }).toThrow();
  });
});
```

- [ ] Type tests for schema validation
- [ ] Type tests for data validation
- [ ] Runtime tests for arktype constraint validation
- [ ] Tests for arktype subtypes (string.email, etc.)

### Task 8: Fix Evaluate Return Type with ArkType

The `evaluate()` return type must work with ANY valid arktype schema, not just 5 hardcoded types.

**Current (broken):**
```typescript
SchemaToType<'string.email'>  // Returns unknown
SchemaToType<'number >= 0'>   // Returns unknown
SchemaToType<'string | number'>  // Returns unknown
```

**Goal:**
```typescript
// Use arktype to infer the TypeScript type from the schema string
type SchemaToType<T extends string> = type.infer<type<T>>;  // or similar

SchemaToType<'string.email'>     // Returns string
SchemaToType<'number >= 0'>      // Returns number
SchemaToType<'string | number'>  // Returns string | number
```

- [ ] Replace `SchemaToType` with arktype-based inference
- [ ] Verify `evaluate()` returns `string` for `outputSchema: 'string.email'`
- [ ] Verify `evaluate()` returns `string | number` for `outputSchema: 'string | number'`
- [ ] Update tests

### Task 9: Fix Type/Runtime Mismatch and Computed Result Types

There are TWO related problems:

**Problem A: Type-level doesn't match runtime for single-binding propagation**

The runtime already propagates outputSchema for single-binding nodes (parentheses), but the type-level code doesn't.

```typescript
// (1 + 2)
// Runtime: outputSchema = 'number' ✓
// Type-level: outputSchema = 'unknown' ✗
```

Fix: Update `BuildNodeResult` in `src/parse/index.ts` to propagate when:
- `TNode['resultType']` is `'unknown'`
- There's exactly one binding
- That binding has an outputSchema

**Problem B: Multi-binding nodes need union computation**

For ternary and similar nodes, the result is a union of branch types.

```typescript
// x ? true : 0
// Should be: outputSchema = 'boolean | number'
```

**Approach:**

1. Allow `resultType` to be a function or special marker:
```typescript
const ternary = defineNode({
  name: 'ternary',
  pattern: [...],
  precedence: 1,
  resultType: { union: ['then', 'else'] },  // Compute union of these bindings' types
});
```

2. At parse time, compute the actual outputSchema from the parsed branches
3. At eval time, return the computed union type

**Tasks:**
- [ ] Fix `BuildNodeResult` to propagate single-binding outputSchema (match runtime)
- [ ] Design the computed result type API for multi-binding nodes
- [ ] Implement type-level union computation
- [ ] Update runtime `buildNodeResult` for union computation
- [ ] Update parentheses to verify single-binding propagation works
- [ ] Update ternary to use computed union result type
- [ ] Add tests for both cases

### Task 10: Update Documentation

- [ ] Update README with arktype integration examples
- [ ] Document supported arktype types
- [ ] Show compile-time and runtime validation examples
- [ ] Document computed result types
- [ ] Update API reference

---

## What NOT to Do

1. **Don't hardcode types.** The whole point is to use arktype's extensible type system, not `'number' | 'string' | 'boolean' | 'null' | 'undefined'`.

2. **Don't use `as any` or `as unknown`** to make types work.

3. **Don't break runtime behavior.** The runtime works. We're adding type safety.

4. **Don't ignore runtime validation.** Arktype provides BOTH compile-time AND runtime validation. Use both.

---

## Acceptance Criteria

The fix is complete when:

**Schema Validation:**
1. `lhs('garbage')` is a type error
2. `rhs('asdfghjkl')` is a type error
3. `parser.parse('x', { x: 'invalid' })` is a type error
4. `lhs('string.email')` compiles successfully
5. `lhs('number >= 0')` compiles successfully

**Data-Schema Connection:**
6. `evaluate(ast, { data: { x: "wrong" } })` is a type error when schema says `x: 'number'`
7. `evaluate(ast, { data: { x: -5 } })` throws at runtime when schema says `x: 'number >= 0'`
8. `evaluate(ast, { data: {} })` is a type error when schema has required variables

**Evaluate Return Types:**
9. `evaluate()` returns `string` when `outputSchema` is `'string.email'`
10. `evaluate()` returns `number` when `outputSchema` is `'number >= 0'`
11. `evaluate()` returns `string | number` when `outputSchema` is `'string | number'`

**Computed Result Types:**
12. Parentheses `(1 + 2)` has `outputSchema: 'number'` at BOTH runtime and type-level
13. Ternary `x ? true : 0` has `outputSchema: 'boolean | number'`
14. `evaluate()` returns `number` for `(1 + 2)`
15. `evaluate()` returns `boolean | number` for ternary `x ? true : 0`

**General:**
16. All existing tests pass
17. New type-level and runtime tests verify all constraints
18. No `any` or unsafe casts in the implementation

---

## Remember

This library's value is **compile-time AND runtime type safety**. ArkType provides both. Use it.

The comment at `src/schema/index.ts:64` literally says to use arktype. That was the plan all along. Execute it.
