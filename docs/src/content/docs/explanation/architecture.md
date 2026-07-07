---
title: Architecture
description: The dual-engine design, the semantics-are-data law, and the reasoning behind stringent's architecture.
---

This page summarizes stringent's architecture and the reasoning behind it. The
authoritative version — the contract the codebase is held to — lives in
[DESIGN.md](https://github.com/eralmansouri/stringent/blob/main/DESIGN.md) in
the repository.

## Vision

One grammar definition, two engines, identical semantics:

- **Type-level engine** (`src/parse/index.ts`): parses string *literals* in
  the type system. Invalid expressions fail compilation; valid ones get an
  exact AST type and an exact result type.
- **Runtime engine** (`src/runtime/parser.ts`): parses *dynamic* strings with
  structured, positioned errors, then evaluates them.

The target use case is schema-aware expression DSLs — form validation rules
like `values.password == values.confirmPassword`, feature-flag conditions,
computed fields — where expressions are authored both as literals in code
(checked at compile time) and as data from configuration (checked at runtime
with good error messages). `parser.compile()` closes the loop by exposing a
rule as an arktype `Type` (and therefore a Standard Schema) that plugs
directly into form/RPC libraries.

## The one architectural law: semantics are data

Every semantic construct — constraints, result types, associativity, laziness
— is **declarative data on the node schema**, never a function. This is forced
by the dual-engine design:

- Types drive *parsing*, not just results. When an operand slot constrained to
  `number` sees a `string` expression, the parser backtracks and tries another
  interpretation — mid-parse, in both engines.
- The runtime engine cannot see TypeScript types, and the type engine cannot
  execute functions. The only language both speak is data.

This is why a node's result type cannot be inferred from `eval`'s TypeScript
return type: the runtime engine needs the type *as data* while parsing. What
the design offers instead is **derivation** — binding references like
`resultType: "left"` — which recovers the inference ergonomics without
breaking the law.

## Dual-engine parity

The two engines are hand-mirrored, function-for-function
(`ParseLevels` ↔ `parseLevels`, `ResolveSpec` ↔ `resolveConstraint`,
`ResultSchemaOf` ↔ `buildNodeResult`, `ScanString` ↔ `scanString`, …). Parity
is enforced by twin test suites over a shared fixture grammar:
`src/parser.test.ts` (runtime ASTs) and `src/types.typetest.ts` (the same
expressions' types). Any grammar feature must land in both engines and both
suites in the same commit.

Parity is over **accept/reject decisions and inferred TypeScript types**, not
display strings. The few deliberate divergences are all conservative — the
type level rejects things the runtime accepts, never vice versa: `\xHH`/
`\uHHHH` string escapes decode at runtime only, `createParser`'s `scope`
aliases resolve at runtime only, and the type level has input-depth limits
the runtime doesn't (see
[Limits & rules](/stringent/guides/parsing-and-evaluation/#limits--rules)).

## Security posture

Expressions are untrusted input. All identifier and path lookups — in the
evaluator *and* in parse-time schema resolution — use own-property checks
(`Object.hasOwn`). `constructor`, `__proto__`, `x.constructor` etc. resolve to
"not defined", never to prototype internals. User node names may not shadow
the built-in node kinds (reserved-name validation), so `eval` dispatch cannot
be hijacked. Failure messages never include runtime values — they may be
secrets.

## Why arktype (recorded intent)

An earlier version of stringent used a **closed nominal vocabulary**: type
names were opaque tags, related only by equality, with dedicated `sameAs`/
`fromBinding` markers for polymorphism. That bought zero dependencies and a
trivially mirrorable matcher — at the cost of no type *expressions*
(`"number > 0"`, `"string | number"`), no subtyping, and a parallel
vocabulary users had to learn next to TypeScript's.

The current design takes the arktype direction deliberately (and pre-1.0,
where the semantic break was cheapest): constraints, result types, and
schemas are arktype definitions, and constraint matching is **assignability**
(`candidate.extends(constraint)` at runtime, `type.infer` conditionals at
compile time). Binding names double as references — a constraint or
`resultType` that names an earlier binding means "whatever that operand
parsed as" — and `overlapping(binding)` is the symmetric form for
equality-style operators. Refinements erase for expression typing and
validate the values object at `evaluate()`, so "if it compiles, it parses"
survives.

## Limits & non-goals (current)

- No union-typed *outputs*: a ternary's branches must agree via a binding
  reference rather than producing `"number | string"`, and binding references
  must be whole constraint strings until union outputs land.
- Evaluation is synchronous (arktype morphs cannot be async); async operators
  must be promise-valued outputs handled by the caller.
- No incremental/streaming parse; inputs are expression-sized strings.
- ESM-only packaging.
- Type-level depth limits apply to literal-mode parsing only — see
  [Limits & rules](/stringent/guides/parsing-and-evaluation/#limits--rules).

## Roadmap candidates

- Union output types with distributed constraint checking (unlocks embedded
  binding references like `"left | null"`).
- Function-call operators via arktype's `type.fn`, paired with a
  `many()`/separated-list pattern element (argument lists).
- Literal result types (number/string/boolean literals as arktype unit types)
  for constant folding and exact-value comparison.
- JSON Schema import (`@ark/json-schema`) to bootstrap a stringent schema
  from an existing document.
- Scope-aware compile-time validation (threading `createParser`'s aliases
  through `type.validate`).
- Positional token spans on AST nodes for editor tooling.
