# Stringent Library - Polish & Enhancement Plan

## Overview

**Stringent** is a type-safe expression parser for TypeScript that provides compile-time validation and inference. It parses expressions (like `values.password == values.confirmPassword`) against a schema at both compile-time and runtime, with full TypeScript type inference.

**Current State:** v0.0.2 (early development)
**Goal:** Polish the library to be production-ready with comprehensive tests, documentation, and missing features.

---

## Executive Summary

### What Works Well
- Sophisticated type-level parsing system
- Precedence-based grammar handling
- Type-runtime mirror pattern (same algorithm at compile and runtime)
- Good JSDoc coverage on core APIs
- Solid type-level tests (~90% coverage)

### What Needs Work
- Runtime tests are incomplete (~30% coverage)
- No error/edge case tests
- Missing primitive literals (null, boolean, undefined)
- eval() function not implemented
- No formal test infrastructure
- Limited documentation beyond README
- No real-world examples beyond arithmetic

---

## Architecture Overview

```
src/
├── index.ts              # Main API exports
├── createParser.ts       # Parser factory (public API)
├── context.ts            # Parse context (schema data)
├── schema/               # Node schema definitions
├── grammar/              # Grammar type computation
├── parse/                # Type-level parsing
├── primitive/            # Primitive parsers (number, string, ident)
├── runtime/              # Runtime parser & inference
└── static/               # Static type re-exports
```

### Key Files to Understand
- `src/createParser.ts` - Main public API, creates type-safe parsers
- `src/schema/index.ts` - defineNode() and pattern element factories
- `src/runtime/parser.ts` - Core runtime parsing algorithm
- `src/parse/index.ts` - Type-level Parse<> implementation
- `src/grammar/index.ts` - Grammar computation from node schemas

---

## Design Considerations (No Backward Compat Needed)

Since this is a new project, consider these potential improvements:

1. **Simplify Exports:** Currently exports many internal types. Consider a cleaner public API surface.

2. **Rename Confusing APIs:**
   - `constVal()` → could be `literal()` or `keyword()` for clarity
   - Pattern element names could be more intuitive

3. **Remove Unused Code:** Combinators (Union, Tuple, Optional, Many) may not be needed in current design

4. **Consolidate Files:** Some small files could be merged for simpler structure

5. **Rethink Error Types:** Current error types are generic - could be redesigned for better DX

---

## Phase 1: Test Infrastructure & Core Testing

### 1.1 Set Up Proper Test Infrastructure
- [x] Install vitest or similar test framework
- [x] Configure test scripts in package.json
- [x] Set up test configuration (vitest.config.ts)
- [x] Remove broken `tsx src/test.ts` reference
- [x] Create test helpers/utilities file

**Files:** `package.json`, `vitest.config.ts` (new)

### 1.2 Runtime Parser Tests
- [x] Create `src/runtime/parser.test.ts` with comprehensive tests
- [x] Test tokenization: numberLiteral, stringLiteral, identifierAtom
- [x] Test parentheses handling and nesting
- [x] Test operator precedence at runtime level
- [x] Test grammar building from node schemas
- [x] Test buildNodeResult field extraction
- [x] Test whitespace handling between tokens

**Files:** `src/runtime/parser.ts`, `src/runtime/parser.test.ts` (new)

### 1.3 Error Handling Tests
- [x] Test invalid syntax errors (malformed expressions)
- [x] Test type mismatch errors (constraint violations)
- [x] Test no-match errors (unknown operators)
- [x] Ensure errors have helpful messages
- [x] Test error recovery behavior

**Files:** `src/parse/index.ts`, `src/error-handling.test.ts` (new)

### 1.4 Edge Case Tests
- [x] Test deeply nested parentheses (10+ levels)
- [x] Test long chained operations (a + b + c + d + e + ...)
- [x] Test mixed precedence chains
- [x] Test empty input handling
- [x] Test whitespace-only input
- [x] Test unicode identifiers
- [x] Test very long string literals
- [x] Test number edge cases (negative, decimals, scientific notation)

### 1.5 Combinator Review
- [x] Evaluate if Union, Tuple, Optional, Many combinators are needed
- [x] If useful: add tests and document
- [x] If not useful: **remove them entirely** (no backward compat concerns)
- [x] Clean up any dead code paths

**Completed:** Removed unused combinators (Union, Tuple, Optional, Many) and related files:
- Deleted `src/combinators/index.ts`
- Deleted `src/static/parser.ts` (only re-exported combinators)
- Removed combinator exports from `src/index.ts`

### 1.6 Inference Tests
- [x] Test runtime infer() function
- [x] Test static Infer<> type
- [x] Test inference with complex AST structures
- [x] Ensure inference matches type-level expectations

**Completed:** Created comprehensive `src/inference.test.ts` with 89 tests.

**Files:** `src/runtime/infer.ts`, `src/static/infer.ts`, `src/inference.test.ts`

---

## Phase 2: Missing Features

### 2.1 Add Missing Primitive Literals
**TODO found in code:** `// todo: add null/boolean/undefined`

- [x] Add `nullLiteral` atom (matches `null`)
- [x] Add `booleanLiteral` atom (matches `true`/`false`)
- [x] Add `undefinedLiteral` atom (matches `undefined`)
- [x] Add corresponding type-level support in Parse<>
- [x] Add tests for new literals
- [x] Update exports in index.ts

**Files:** `src/runtime/parser.ts:91`, `src/parse/index.ts`, `src/index.ts`

### 2.2 Implement eval() Function
**README states:** "Coming Soon"

- [x] Design eval function signature
- [x] Implement recursive AST evaluation
- [x] Handle binary operators based on node type
- [x] Handle identifier resolution from context
- [x] Handle literal values
- [x] Add type-safe return type inference
- [x] Write comprehensive eval tests
- [x] Update README to remove "Coming Soon"

**Files:** `src/runtime/eval.ts` (new), `README.md`

### 2.3 String Escape Handling
- [x] Review current string parsing for escape sequences
- [x] Add support for `\n`, `\t`, `\\`, `\"`, `\'`
- [x] Add tests for escaped strings
- [x] Handle unicode escapes (`\uXXXX`)

**Completed:** Implemented custom string parser with proper escape handling.

**Files:** `src/runtime/parser.ts`, `src/string-escapes.test.ts`

---

## Phase 3: API Polish

### 3.1 Error Messages
- [x] Improve ParseError messages with position info
- [x] Add source position tracking during parsing
- [x] Include snippet of problematic input in errors
- [x] Make TypeMismatchError more descriptive

**Completed:** Implemented comprehensive error system with:
- `RichParseError` type with position (offset, line, column), message, and snippet
- `SourcePosition` interface for position tracking
- `parseWithErrors()` function that returns detailed error info on failure
- Error creation utilities: `noMatchError`, `typeMismatchError`, `unterminatedStringError`, etc.
- `formatParseError()` and `formatErrors()` for human-readable output
- 62 tests covering position calculation, snippet creation, error formatting

**Files:** `src/errors.ts` (new), `src/runtime/parser.ts`, `src/error-messages.test.ts` (new)

### 3.2 API Consistency
- [x] Review all exports for naming consistency
- [x] Ensure factory functions follow consistent patterns
- [x] **Remove legacy exports** (Number, String, Ident, Const) - no backward compat needed
- [x] Redesign any awkward APIs for better ergonomics
- [x] Simplify exports - only expose what's truly needed

**Completed:** Cleaned up the public API surface:
- Removed legacy capitalized factories: `Number`, `String`, `Ident`, `Const`
- Removed legacy type exports: `IParser`, `ParseResult`, `Primitive`
- Renamed internal factories to `createNumber`, `createString`, `createIdent`, `createConst` with `@internal` JSDoc
- Public API now only exposes schema factories: `number()`, `string()`, `ident()`, `constVal()`, etc.
- All 643 tests pass with the cleaned-up API

### 3.3 Type Safety Review
- [x] Audit for `any` types that could be stricter
- [x] Ensure all public APIs have proper type inference
- [x] Test that type errors are comprehensible
- [x] Add type tests for common mistake scenarios

**Completed:** Comprehensive type safety improvements:
- Replaced 4 `any` type usages with stricter types (`unknown`, `ASTNode<string, unknown>`)
- Created `src/type-safety.test.ts` with 48 tests covering:
  - Public API type inference (createParser, defineNode, evaluate, infer, parseWithErrors)
  - Parse result type inference (literals, binary operations, context-based typing)
  - Type error comprehensibility (no match returns [], partial matches)
  - Common mistake scenarios (pattern usage, precedence, expression roles)
  - Schema factory types (all primitives and expression schemas)
  - Infer type system (all node types, never for non-AST)
- All 691 tests pass, TypeScript typecheck passes

**Files:** `src/createParser.ts`, `src/runtime/parser.ts`, `src/errors.ts`, `src/type-safety.test.ts` (new)

---

## Phase 4: Documentation

### 4.1 README Enhancement
- [x] Add more usage examples beyond arithmetic
- [x] Document all pattern elements with examples
- [x] Add comparison operators example
- [x] Add field validation example
- [x] Add conditional expression example
- [x] Document error handling patterns
- [x] Add TypeScript version requirements
- [x] Add badges (npm version, build status, etc.)

**Files:** `README.md`

### 4.2 API Reference
- [x] Create `/docs` directory
- [x] Document createParser() API in detail
- [x] Document defineNode() and all options
- [x] Document all pattern element factories
- [x] Document Context type and usage
- [x] Document Grammar type structure
- [x] Document AST node types
- [x] Generate API docs from JSDoc (typedoc)

**Completed:** Created comprehensive `/docs/api-reference.md` with:
- Full createParser() documentation with type safety examples
- Complete defineNode() reference including precedence, configure, and eval
- All pattern element factories (atoms: number, string, ident, nullLiteral, booleanLiteral, undefinedLiteral, constVal; expressions: lhs, rhs, expr)
- The .as() method for naming bindings
- Runtime functions: evaluate(), createEvaluator(), infer(), parseWithErrors()
- All types: Parser, NodeSchema, Context, Grammar, AST node types
- Error handling: error types, utilities, and factories
- Type-level utilities: Parse, Infer, ComputeGrammar, SchemaToType, InferBindings
- Typedoc configuration for auto-generated API docs from JSDoc comments
- Scripts: `docs` and `docs:watch` added to package.json
- Generated docs output to `/docs/api/` (gitignored)

**Files:** `/docs/api-reference.md` (new), `typedoc.json` (new)

### 4.3 Architecture Documentation
- [ ] Document precedence-based parsing algorithm
- [ ] Document type-runtime mirror pattern
- [ ] Document lhs/rhs/expr role system
- [ ] Create architecture diagram
- [ ] Document grammar computation

### 4.4 Examples
- [x] Create `/examples` directory
- [x] Add basic arithmetic example
- [x] Add comparison operators example
- [x] Add form validation example
- [x] Add conditional/ternary example
- [x] Add custom operators example

**Completed:** Created `/examples` directory with 5 comprehensive examples:
- `basic-arithmetic.ts` - Addition, subtraction, multiplication, division, exponentiation with precedence
- `comparison-operators.ts` - Equality, inequality, less/greater than, filter system example
- `form-validation.ts` - Password confirmation, age validation, email validation, custom operators
- `conditional-ternary.ts` - Ternary expressions, grade calculator, value clamping
- `custom-operators.ts` - String DSL, custom operators (divides, between), nullish coalescing, unit conversion

**Files:** `/examples/` (new directory)

### 4.5 Contributing Guide
- [ ] Create CONTRIBUTING.md
- [ ] Document development setup
- [ ] Document test running
- [ ] Document code patterns and conventions
- [ ] Add pull request template

---

## Phase 5: Build & CI

### 5.1 Build Configuration
- [ ] Review tsconfig.json settings
- [ ] Ensure source maps are generated
- [ ] Review dist output structure
- [ ] Add minification if appropriate

### 5.2 CI Pipeline
- [ ] Add GitHub Actions workflow
- [ ] Run tests on PR
- [ ] Run type checking on PR
- [ ] Run build verification
- [ ] Add test coverage reporting

### 5.3 Package.json Cleanup
- [x] Fix broken test script
- [x] Add proper scripts (test, test:watch, build, lint)
- [x] Review dependencies
- [x] Add engines field (Node.js version)
- [x] Add keywords for npm discovery

**Completed:** Package.json is now production-ready:
- Scripts: `build`, `typecheck`, `lint`, `test`, `test:watch`, `test:coverage`, `prepublishOnly`
- Added `engines` field requiring Node.js >=18.0.0
- Expanded keywords for npm discoverability: type-safe, compile-time, type-level, expression-parser, dsl, ast, grammar, validation, inference
- Reviewed dependencies: hotscript correctly remains a devDependency (type-only imports)

---

## Phase 6: Final Polish

### 6.1 Code Quality
- [ ] Add ESLint configuration
- [ ] Add Prettier configuration
- [ ] Fix any linting issues
- [ ] Ensure consistent code style

### 6.2 Performance Review
- [ ] Profile parsing performance
- [ ] Identify any obvious optimizations
- [ ] Document performance characteristics

### 6.3 Pre-1.0 Checklist
- [ ] All tests pass
- [ ] Test coverage > 80%
- [ ] All TODO comments resolved
- [ ] Documentation complete
- [ ] No breaking API changes pending
- [ ] Version bump to 1.0.0-beta

---

## Priority Order

**Critical (Must Have for Production):**
1. Test infrastructure setup (1.1)
2. Runtime parser tests (1.2)
3. Error handling tests (1.3)
4. Missing primitives (2.1)

**High (Important for Quality):**
5. Edge case tests (1.4)
6. eval() implementation (2.2)
7. README enhancement (4.1)
8. Package.json cleanup (5.3)

**Medium (Nice to Have):**
9. API reference docs (4.2)
10. Examples (4.4)
11. CI pipeline (5.2)
12. Contributing guide (4.5)

**Low (Future Enhancement):**
13. Architecture docs (4.3)
14. Code quality tools (6.1)
15. Performance review (6.2)

---

## Files Quick Reference

| File | Purpose | Key Changes Needed |
|------|---------|-------------------|
| `src/runtime/parser.ts` | Runtime parsing | Add null/bool/undefined, improve errors |
| `src/parse/index.ts` | Type-level parsing | Match runtime changes |
| `src/index.ts` | Public exports | Export new primitives |
| `package.json` | Project config | Fix scripts, add dev deps |
| `README.md` | Documentation | Expand examples |
| `vitest.config.ts` | Test config | Create new |
| `src/runtime/eval.ts` | Expression eval | Create new |
| `/docs/` | API docs | Create new |
| `/examples/` | Usage examples | Create new |

---

## Notes for Implementation Agents

1. **Type-Runtime Parity:** Any change to runtime parsing MUST have corresponding type-level changes. The library's value prop is that types and runtime stay in sync.

2. **No Backward Compatibility Required:** This is a new project (v0.0.2). Feel free to:
   - Remove legacy exports (Number, String, Ident, Const)
   - Rename/redesign APIs for better ergonomics
   - Break existing behavior if it improves the design
   - Clean up exports to only expose what's truly needed

3. **Test Philosophy:** Most existing tests are type-level (compile-time). Runtime tests should verify actual parsing behavior, not just types.

4. **Dependencies:** The library uses `@sinclair/parsebox` for tokenization, `hotscript` for type manipulation, and `arktype` for validation.

5. **Expression Roles:** The lhs/rhs/expr system is critical for correct precedence. Understand this before modifying grammar handling.

6. **Design Freedom:** Prioritize clean, intuitive APIs. If something feels awkward, redesign it rather than documenting around it.
