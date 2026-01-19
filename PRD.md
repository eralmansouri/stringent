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
- [ ] Improve ParseError messages with position info
- [ ] Add source position tracking during parsing
- [ ] Include snippet of problematic input in errors
- [ ] Make TypeMismatchError more descriptive

### 3.2 API Consistency
- [ ] Review all exports for naming consistency
- [ ] Ensure factory functions follow consistent patterns
- [ ] **Remove legacy exports** (Number, String, Ident, Const) - no backward compat needed
- [ ] Redesign any awkward APIs for better ergonomics
- [ ] Simplify exports - only expose what's truly needed

### 3.3 Type Safety Review
- [ ] Audit for `any` types that could be stricter
- [ ] Ensure all public APIs have proper type inference
- [ ] Test that type errors are comprehensible
- [ ] Add type tests for common mistake scenarios

---

## Phase 4: Documentation

### 4.1 README Enhancement
- [ ] Add more usage examples beyond arithmetic
- [ ] Document all pattern elements with examples
- [ ] Add comparison operators example
- [ ] Add field validation example
- [ ] Add conditional expression example
- [ ] Document error handling patterns
- [ ] Add TypeScript version requirements
- [ ] Add badges (npm version, build status, etc.)

**Files:** `README.md`

### 4.2 API Reference
- [ ] Create `/docs` directory
- [ ] Document createParser() API in detail
- [ ] Document defineNode() and all options
- [ ] Document all pattern element factories
- [ ] Document Context type and usage
- [ ] Document Grammar type structure
- [ ] Document AST node types
- [ ] Generate API docs from JSDoc (typedoc)

**Files:** `/docs/` (new directory)

### 4.3 Architecture Documentation
- [ ] Document precedence-based parsing algorithm
- [ ] Document type-runtime mirror pattern
- [ ] Document lhs/rhs/expr role system
- [ ] Create architecture diagram
- [ ] Document grammar computation

### 4.4 Examples
- [ ] Create `/examples` directory
- [ ] Add basic arithmetic example
- [ ] Add comparison operators example
- [ ] Add form validation example
- [ ] Add conditional/ternary example
- [ ] Add custom operators example

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
- [ ] Fix broken test script
- [ ] Add proper scripts (test, test:watch, build, lint)
- [ ] Review dependencies
- [ ] Add engines field (Node.js version)
- [ ] Add keywords for npm discovery

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
