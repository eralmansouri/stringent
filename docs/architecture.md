# Stringent Architecture

This document describes the internal architecture of Stringent, a type-safe expression parser for TypeScript. It covers the core algorithms, design patterns, and how the type system and runtime work together.

## Table of Contents

1. [Overview](#overview)
2. [Precedence-Based Parsing Algorithm](#precedence-based-parsing-algorithm)
3. [Type-Runtime Mirror Pattern](#type-runtime-mirror-pattern)
4. [LHS/RHS/Expr Role System](#lhsrhsexpr-role-system)
5. [Grammar Computation](#grammar-computation)
6. [Architecture Diagram](#architecture-diagram)

---

## Overview

Stringent implements a **precedence-based recursive descent parser** that operates at both compile-time (TypeScript types) and runtime. The key architectural insight is that the same parsing algorithm executes at both stages, ensuring that types accurately reflect runtime behavior.

### Core Components

| Component | File | Purpose |
|-----------|------|---------|
| Parser Factory | `src/createParser.ts` | Public API for creating type-safe parsers |
| Node Schema | `src/schema/index.ts` | `defineNode()` and pattern element factories |
| Runtime Parser | `src/runtime/parser.ts` | Runtime parsing implementation |
| Type-Level Parser | `src/parse/index.ts` | Compile-time parsing via TypeScript types |
| Grammar Builder | `src/grammar/index.ts` | Transforms node schemas into grammar structure |
| Evaluator | `src/runtime/eval.ts` | AST evaluation to produce values |
| Inference | `src/runtime/infer.ts`, `src/static/infer.ts` | Type inference from AST nodes |

---

## Precedence-Based Parsing Algorithm

Stringent uses a **level-based precedence algorithm** where operators are grouped by precedence and processed in a specific order.

### Grammar Structure

The grammar is organized as a tuple of levels:

```
Grammar = [[Level0Ops], [Level1Ops], ..., [LevelN Ops], [BuiltInAtoms]]
```

- Levels are sorted by precedence in **ascending order** (lowest first)
- Each level contains operators at that precedence tier
- Built-in atoms (numbers, strings, identifiers) are always the final level

### Parsing Flow

The `parseLevels()` function implements recursive descent:

```
parseLevels(levels, input, context)
  1. If only atoms remain → try parsing atoms
  2. Try each node in current level (levels[0])
  3. If match found → return [node, remaining]
  4. If no match → recurse to parseLevels(levels.slice(1), ...)
```

### Precedence Semantics

The precedence value determines binding strength:

| Precedence | Tried | Binds | Evaluated |
|------------|-------|-------|-----------|
| Lower (1)  | First | Loosely | Last |
| Higher (3) | Later | Tightly | First |

**Example:** For `2 + 3 * 4` with `+` at precedence 1 and `*` at precedence 2:

1. Level 1 (`+`): Try to match addition
2. LHS parses `2` (falls through to atoms)
3. Matches `+` operator
4. RHS recursively parses `3 * 4` at level 2
5. Level 2 (`*`): Matches multiplication
6. Result: `add(2, mul(3, 4))` evaluates to `2 + 12 = 14`

This approach avoids left-recursion by trying lower-precedence operators first, which delegate to higher-precedence levels for their operands.

### Key Insight

The parser doesn't need explicit associativity declarations because the role system (lhs/rhs) handles this implicitly:

- **LHS** skips the current level → prevents infinite left-recursion
- **RHS** stays at current level → enables right-recursion for right-associativity

---

## Type-Runtime Mirror Pattern

Stringent's core value proposition is that **types accurately reflect runtime behavior**. This is achieved by implementing the same algorithm at both stages.

### Parallel Implementation

| Runtime Function | Type-Level Type |
|-----------------|-----------------|
| `parseLevels()` | `ParseLevels<>` |
| `parseNodes()` | `ParseNodes<>` |
| `parseNodePattern()` | `ParseNodePattern<>` |
| `parseElementWithLevel()` | `ParseElementWithLevel<>` |
| `buildGrammar()` | `ComputeGrammar<>` |

### Control Flow Correspondence

**Runtime (JavaScript):**
```typescript
function parseLevels(levels, input, context) {
  if (levels.length === 1) {
    return parseNodes(levels[0], input, context);
  }
  const result = parseNodes(levels[0], input, context);
  if (result.length > 0) return result;
  return parseLevels(levels.slice(1), input, context);
}
```

**Type-Level (TypeScript):**
```typescript
type ParseLevels<TLevels, TInput, TContext> =
  TLevels extends [infer First, ...infer Rest]
    ? Rest extends []
      ? ParseNodes<First, TInput, TContext>
      : ParseNodes<First, TInput, TContext> extends [infer Node, infer Remaining]
        ? [Node, Remaining]
        : ParseLevels<Rest, TInput, TContext>
    : [];
```

### Synchronization Guarantees

1. **Grammar Computation**: `ComputeGrammar<>` produces the same structure as `buildGrammar()`
2. **Return Type Binding**: The `parse()` function's return type is `Parse<ComputeGrammar<TNodes>, TInput, TContext>`
3. **Constraint Checking**: Both implementations validate `outputSchema` against type constraints

When parsing succeeds at runtime, TypeScript already knows the exact result type because the same logic computed it at compile-time.

### Benefits

- **Type Safety**: Parse results have accurate types without type assertions
- **IDE Support**: Autocomplete works on parsed AST nodes
- **Error Detection**: Type mismatches caught at compile-time
- **Refactoring Safety**: Type changes propagate through the parser

---

## LHS/RHS/Expr Role System

The role system solves two problems:
1. Avoiding left-recursion (which causes infinite loops)
2. Controlling operator associativity

### The Three Roles

#### LHS (Left-Hand Side)

- **Grammar Slice**: Uses `nextLevels` (skips current level)
- **Purpose**: Prevents left-recursion
- **Position**: First position in a pattern

```typescript
// Pattern: [lhs("number").as("left"), constVal("+"), rhs("number").as("right")]
// For input "1 + 2 + 3":
// - LHS parses "1" (skips + level, goes to atoms)
// - Matches "+"
// - RHS handles "2 + 3"
```

#### RHS (Right-Hand Side)

- **Grammar Slice**: Uses `currentLevels` (stays at current level)
- **Purpose**: Enables right-associativity
- **Position**: Typically after an operator

```typescript
// For input "2 ** 3 ** 4" with ** at precedence 2:
// - LHS parses "2"
// - Matches "**"
// - RHS parses "3 ** 4" (can match ** again)
// - Result: pow(2, pow(3, 4)) = 2^81
```

#### Expr (Full Expression)

- **Grammar Slice**: Uses `fullGrammar` (resets to lowest precedence)
- **Purpose**: Allows any expression in delimited contexts
- **Position**: Inside parentheses, function arguments, branches

```typescript
// Pattern: [constVal("("), expr().as("inner"), constVal(")")]
// For input "(1 + 2)":
// - Matches "("
// - Expr parses "1 + 2" with full grammar (can use +)
// - Matches ")"
// - Result: parens(add(1, 2))
```

### Role Selection in Code

**Runtime** (`src/runtime/parser.ts`):
```typescript
if (role === "lhs") {
  return parseExprWithConstraint(nextLevels, ...);
} else if (role === "rhs") {
  return parseExprWithConstraint(currentLevels, ...);
} else {
  return parseExprWithConstraint(fullGrammar, ...);
}
```

**Type-Level** (`src/parse/index.ts`):
```typescript
type ParseElementWithLevel<...> =
  TElement extends { role: infer Role }
    ? Role extends "lhs"
      ? ParseExprWithConstraint<TNextLevels, ...>
      : Role extends "rhs"
        ? ParseExprWithConstraint<TCurrentLevels, ...>
        : ParseExprWithConstraint<TFullGrammar, ...>
    : ...
```

### Associativity Examples

| Operator | Pattern | Associativity | Example |
|----------|---------|---------------|---------|
| `+` | `[lhs, "+", rhs]` | Right | `1+2+3` → `1+(2+3)` |
| `**` | `[lhs, "**", rhs]` | Right | `2**3**4` → `2**(3**4)` |
| `?:` | `[lhs, "?", expr, ":", expr]` | N/A | Branches use `expr` |

---

## Grammar Computation

The grammar is computed from node schemas at both compile-time and runtime.

### Input: Node Schemas

```typescript
const nodes = [
  defineNode({ name: "add", precedence: 1, pattern: [...], ... }),
  defineNode({ name: "mul", precedence: 2, pattern: [...], ... }),
  defineNode({ name: "sub", precedence: 1, pattern: [...], ... }),
] as const;
```

### Transformation Steps

1. **Group by Precedence**
   ```
   { 1: [add, sub], 2: [mul] }
   ```

2. **Convert to Entries**
   ```
   [[1, [add, sub]], [2, [mul]]]
   ```

3. **Sort by Precedence (Ascending)**
   ```
   [[1, [add, sub]], [2, [mul]]]
   ```

4. **Extract Node Arrays**
   ```
   [[add, sub], [mul]]
   ```

5. **Append Built-In Atoms**
   ```
   [[add, sub], [mul], [numberLiteral, stringLiteral, identifierAtom, ...]]
   ```

### Type-Level Implementation

The `ComputeGrammar<>` type uses **hotscript** for type-level programming:

```typescript
type ComputeGrammar<TNodes> = Eval<
  Pipe<
    TNodes,
    [
      Tuples.GroupBy<Objects.Get<"precedence">>,
      Objects.Entries,
      Unions.ToTuple,
      Tuples.Sort<SortByPrecedence>,
      Tuples.Map<Tuples.At<1>>,
    ]
  >
> extends infer Levels
  ? readonly [...Levels, BuiltInAtoms]
  : never;
```

### Runtime Implementation

```typescript
function buildGrammar(nodes: NodeSchema[]): Grammar {
  const byPrecedence = new Map<number, NodeSchema[]>();

  for (const node of nodes) {
    const level = byPrecedence.get(node.precedence) ?? [];
    level.push(node);
    byPrecedence.set(node.precedence, level);
  }

  const precedences = [...byPrecedence.keys()].sort((a, b) => a - b);
  const levels = precedences.map(p => byPrecedence.get(p)!);

  return [...levels, BUILT_IN_ATOMS];
}
```

### Why Const Generics Matter

The `defineNode()` function uses `const` generics to preserve literal types:

```typescript
function defineNode<
  const TName extends string,      // "add" not string
  const TPattern extends ...,
  const TPrecedence extends number // 1 not number
>(config): NodeSchema<TName, TPattern, TPrecedence, ...>
```

Without `const`, TypeScript would widen `"add"` to `string` and `1` to `number`, breaking compile-time grammar computation.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              User Code                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   const nodes = [                                                        │
│     defineNode({ name: "add", precedence: 1, pattern: [...] }),          │
│     defineNode({ name: "mul", precedence: 2, pattern: [...] }),          │
│   ] as const;                                                            │
│                                                                          │
│   const parser = createParser(nodes);                                    │
│   const result = parser.parse("1 + 2 * 3", {});                          │
│                                                                          │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           createParser()                                 │
│                         src/createParser.ts                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   • Creates parser instance with parse() method                          │
│   • Validates input at compile-time via ValidatedInput<>                 │
│   • Returns typed Parser<TNodes, TContext>                               │
│                                                                          │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
           ┌───────────────────┴───────────────────┐
           │                                       │
           ▼                                       ▼
┌─────────────────────────┐           ┌─────────────────────────┐
│   Compile-Time Path     │           │    Runtime Path         │
│                         │           │                         │
│   src/grammar/index.ts  │           │   src/runtime/parser.ts │
│   src/parse/index.ts    │           │                         │
├─────────────────────────┤           ├─────────────────────────┤
│                         │           │                         │
│  ComputeGrammar<Nodes>  │    ═══    │  buildGrammar(nodes)    │
│         │               │   sync    │         │               │
│         ▼               │           │         ▼               │
│  ParseLevels<...>       │    ═══    │  parseLevels(...)       │
│         │               │   sync    │         │               │
│         ▼               │           │         ▼               │
│  ParseNodes<...>        │    ═══    │  parseNodes(...)        │
│         │               │   sync    │         │               │
│         ▼               │           │         ▼               │
│  ParseNodePattern<...>  │    ═══    │  parseNodePattern(...)  │
│         │               │   sync    │         │               │
│         ▼               │           │         ▼               │
│  Parse Result Type      │           │  Parse Result Value     │
│                         │           │                         │
└────────────┬────────────┘           └────────────┬────────────┘
             │                                     │
             └──────────────────┬──────────────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │    Unified Result     │
                    ├───────────────────────┤
                    │                       │
                    │  Type: [AddNode<...>] │ ◄── From compile-time
                    │  Value: [{ node:...}] │ ◄── From runtime
                    │                       │
                    │  Type === typeof Value│
                    │                       │
                    └───────────────────────┘
```

### Data Flow for Expression `"2 + 3 * 4"`

```
Input: "2 + 3 * 4"
Grammar: [[add, sub], [mul, div], [atoms]]

┌─────────────────────────────────────────────────────────────────┐
│ Level 0 (precedence 1): Try addition/subtraction                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Pattern: [lhs("number"), "+", rhs("number")]                    │
│                                                                  │
│  1. Parse LHS with nextLevels [[mul, div], [atoms]]             │
│     └─► Falls through to atoms, parses "2"                       │
│                                                                  │
│  2. Match "+" ✓                                                  │
│                                                                  │
│  3. Parse RHS with currentLevels [[add, sub], [mul, div], ...]  │
│     └─► Recurses to Level 1                                      │
│                                                                  │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│ Level 1 (precedence 2): Try multiplication/division             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Pattern: [lhs("number"), "*", rhs("number")]                    │
│                                                                  │
│  1. Parse LHS with nextLevels [[atoms]]                          │
│     └─► Parses "3"                                               │
│                                                                  │
│  2. Match "*" ✓                                                  │
│                                                                  │
│  3. Parse RHS with currentLevels [[mul, div], [atoms]]          │
│     └─► Falls through to atoms, parses "4"                       │
│                                                                  │
│  Result: mul(3, 4)                                               │
│                                                                  │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│ Final Result                                                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  add(2, mul(3, 4))                                               │
│                                                                  │
│  Type: [{ node: "add", left: NumberNode, right: MulNode }, ""]   │
│                                                                  │
│  Evaluation: 2 + (3 * 4) = 2 + 12 = 14                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Design Decisions

### 1. Right-Associativity by Default

All binary operators are right-associative because RHS uses `currentLevels`. This is mathematically correct for most operators and simplifies the implementation.

### 2. Atoms as Final Level

Built-in atoms (numbers, strings, identifiers, etc.) are always the last level. This ensures they're only matched when no operators apply, acting as the base case for recursion.

### 3. Pattern-Based Node Definition

Nodes are defined via patterns rather than grammar rules. This makes it easier to:
- Capture bindings with `.as(name)`
- Define type constraints on operands
- Attach evaluation functions

### 4. Const Generics for Literal Preservation

The `const` modifier on generics preserves literal types, enabling accurate compile-time grammar computation.

### 5. First Match Wins

The parser returns the first successful match. This makes parsing deterministic and predictable.

---

## File Reference

| File | Purpose |
|------|---------|
| `src/index.ts` | Public API exports |
| `src/createParser.ts` | Parser factory and types |
| `src/schema/index.ts` | `defineNode()` and pattern elements |
| `src/grammar/index.ts` | Grammar computation types |
| `src/parse/index.ts` | Type-level parsing |
| `src/runtime/parser.ts` | Runtime parsing |
| `src/runtime/eval.ts` | AST evaluation |
| `src/runtime/infer.ts` | Runtime type inference |
| `src/static/infer.ts` | Type-level inference |
| `src/primitive/index.ts` | Primitive value parsers |
| `src/context.ts` | Parse context types |
| `src/errors.ts` | Error types and utilities |
