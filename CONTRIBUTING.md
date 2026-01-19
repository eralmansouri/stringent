# Contributing to Stringent

Thank you for your interest in contributing to Stringent! This guide will help you get started with development.

## Table of Contents

- [Development Setup](#development-setup)
- [Running Tests](#running-tests)
- [Code Patterns and Conventions](#code-patterns-and-conventions)
- [Architecture Overview](#architecture-overview)
- [Making Changes](#making-changes)
- [Pull Request Process](#pull-request-process)

## Development Setup

### Prerequisites

- **Node.js**: 18.0 or higher
- **pnpm**: 9.0 or higher (recommended package manager)
- **TypeScript**: 5.0 or higher (installed as dev dependency)

### Getting Started

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/stringent.git
   cd stringent
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Run the build to verify setup**
   ```bash
   pnpm build
   ```

4. **Run tests to ensure everything works**
   ```bash
   pnpm test
   ```

### Available Scripts

| Script | Description |
|--------|-------------|
| `pnpm build` | Compile TypeScript to `dist/` |
| `pnpm typecheck` | Run TypeScript type checking without emitting |
| `pnpm lint` | Run linting (currently uses typecheck) |
| `pnpm test` | Run all tests once |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm test:coverage` | Run tests with coverage report |
| `pnpm docs` | Generate API documentation with TypeDoc |
| `pnpm docs:watch` | Generate docs in watch mode |

## Running Tests

Stringent uses [Vitest](https://vitest.dev/) as its test framework. Tests are located alongside source files with a `.test.ts` suffix.

### Run all tests

```bash
pnpm test
```

### Run tests in watch mode (during development)

```bash
pnpm test:watch
```

### Run tests with coverage

```bash
pnpm test:coverage
```

### Test file locations

```
src/
├── createParser.test.ts      # Parser creation tests
├── parse/index.test.ts       # Type-level parsing tests
├── types.test.ts             # Type system tests
├── runtime/
│   ├── parser.test.ts        # Runtime parser tests
│   └── eval.test.ts          # Evaluation tests
├── error-handling.test.ts    # Error handling tests
├── edge-cases.test.ts        # Edge case tests
├── inference.test.ts         # Type inference tests
├── primitive-literals.test.ts # Literal parsing tests
├── string-escapes.test.ts    # String escape tests
├── error-messages.test.ts    # Error message tests
└── type-safety.test.ts       # Type safety tests
```

### Writing Tests

Tests should cover both runtime behavior and type-level correctness:

```typescript
import { describe, it, expect } from "vitest";
import { createParser, defineNode, constVal, lhs, rhs } from "./index.js";
import { typeCheck, AssertEqual } from "./test-helpers.js";

describe("MyFeature", () => {
  // Runtime test
  it("should parse correctly at runtime", () => {
    const result = parser.parse("1 + 2", {});
    expect(result.length).toBe(2);
    expect(result[0].node).toBe("add");
  });

  // Type-level test
  it("should infer correct types", () => {
    const result = parser.parse("1 + 2", {});
    // Use typeCheck to verify compile-time types
    typeCheck<AssertEqual<typeof result[0]["outputSchema"], "number">>();
  });
});
```

## Code Patterns and Conventions

### Type-Runtime Mirror Pattern

Stringent's core design principle is that type-level and runtime implementations mirror each other. When modifying parsing logic:

- **Runtime code** lives in `src/runtime/`
- **Type-level code** lives in `src/parse/` and `src/static/`
- Changes to one **must** be reflected in the other

Example of the mirror pattern:

```typescript
// Runtime (src/runtime/parser.ts)
function parseNumber(input: string): ParseResult {
  // ... parsing logic
}

// Type-level (src/parse/index.ts)
type ParseNumber<Input extends string> =
  // ... same logic expressed as types
```

### File Organization

```
src/
├── index.ts           # Public API exports
├── createParser.ts    # Main parser factory
├── context.ts         # Parse context types
├── errors.ts          # Error types and utilities
├── schema/            # Node schema definitions
├── grammar/           # Grammar type computation
├── parse/             # Type-level parsing
├── primitive/         # Primitive parsers (number, string, etc.)
├── runtime/           # Runtime parser & evaluation
└── static/            # Static type exports
```

### Naming Conventions

- **Schema types**: PascalCase with `Schema` suffix (e.g., `NumberSchema`, `ExprSchema`)
- **Node types**: PascalCase with `Node` suffix (e.g., `NumberNode`, `BinaryNode`)
- **Factory functions**: camelCase (e.g., `defineNode`, `createParser`)
- **Pattern elements**: camelCase (e.g., `number()`, `string()`, `lhs()`, `rhs()`)
- **Internal functions**: prefixed with underscore or marked `@internal`

### TypeScript Guidelines

1. **Preserve literal types**: Use `as const` and const generics
   ```typescript
   // Good - preserves literal types
   defineNode({ name: "add", ... } as const)

   // Avoid - loses literal type information
   defineNode({ name: "add" as string, ... })
   ```

2. **Avoid `any`**: Use `unknown` or specific types
   ```typescript
   // Avoid
   function parse(input: any): any

   // Prefer
   function parse(input: string): ASTNode<string, unknown>
   ```

3. **JSDoc for public APIs**: Document all exported functions and types
   ```typescript
   /**
    * Creates a type-safe expression parser.
    * @param nodes - Array of node schemas defining the grammar
    * @returns A parser with compile-time type inference
    */
   export function createParser<...>(...) { }
   ```

4. **No unused exports**: Only export what users need

### Code Style

- Use 2-space indentation
- Prefer `const` over `let`
- Use explicit return types for public functions
- Use template literals for string interpolation
- Avoid abbreviations in variable names (except common ones like `ctx`, `ast`)

## Architecture Overview

For detailed architecture documentation, see [docs/architecture.md](./docs/architecture.md).

### Key Concepts

1. **Precedence-based parsing**: Lower precedence numbers bind more loosely
2. **LHS/RHS/Expr roles**: Control how recursion works in the grammar
3. **Schema-based nodes**: Patterns are pure type descriptors
4. **Grammar computation**: Schemas are transformed into parsing grammars

## Making Changes

### Before You Start

1. Check existing issues to see if your change is already being worked on
2. For significant changes, open an issue first to discuss the approach
3. Make sure you understand the type-runtime mirror pattern

### Development Workflow

1. Create a feature branch
   ```bash
   git checkout -b feature/my-feature
   ```

2. Make your changes, ensuring:
   - Type-level and runtime code stay in sync
   - Tests cover both runtime behavior and type inference
   - No TypeScript errors (`pnpm typecheck`)
   - All tests pass (`pnpm test`)

3. Write or update tests for your changes

4. Update documentation if needed:
   - README.md for user-facing changes
   - docs/api-reference.md for API changes
   - docs/architecture.md for internal changes

5. Commit your changes with a descriptive message
   ```bash
   git commit -m "Add feature X that does Y"
   ```

### Commit Message Guidelines

- Use present tense ("Add feature" not "Added feature")
- Use imperative mood ("Move cursor to..." not "Moves cursor to...")
- Keep the first line under 72 characters
- Reference issues when relevant ("Fix #123")

Examples:
- `Add nullish coalescing operator support`
- `Fix precedence handling for ternary expressions`
- `Update README with new pattern elements`

## Pull Request Process

1. **Ensure CI passes**: All tests and type checks must pass

2. **Update documentation**: If you changed the API, update relevant docs

3. **Fill out the PR template**: Describe your changes and testing approach

4. **Request review**: Wait for maintainer review

5. **Address feedback**: Make requested changes in new commits

### PR Checklist

Before submitting, verify:

- [ ] All tests pass (`pnpm test`)
- [ ] Type checking passes (`pnpm typecheck`)
- [ ] Code follows existing patterns and conventions
- [ ] Type-level and runtime changes are synchronized
- [ ] Documentation is updated if needed
- [ ] Commit messages are clear and descriptive

### What to Expect

- PRs are typically reviewed within a few days
- Small, focused PRs are easier to review and merge
- Be prepared to iterate based on feedback

## Questions?

If you have questions about contributing:

1. Check existing documentation in `/docs`
2. Look at similar code in the codebase
3. Open a discussion or issue on GitHub

Thank you for contributing to Stringent!
