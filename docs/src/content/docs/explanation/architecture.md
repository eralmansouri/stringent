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
with good error messages).

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
return type: the runtime engine needs the type name *as a string* while
parsing. What the design offers instead is **derivation** (`fromBinding`),
which recovers the inference ergonomics without breaking the law.

## Dual-engine parity

The two engines are hand-mirrored, function-for-function
(`ParseLevels` ↔ `parseLevels`, `ResolveSpec` ↔ `resolveConstraintSpec`,
`ResultSchemaOf` ↔ `resultSchemaOf`, …). Parity is enforced by twin test
suites over a shared fixture grammar: `src/parser.test.ts` (runtime ASTs) and
`src/types.typetest.ts` (the same expressions' types). Any grammar feature
must land in both engines and both suites in the same commit.

## Security posture

Expressions are untrusted input. All identifier and path lookups — in the
evaluator *and* in parse-time schema resolution — use own-property checks
(`Object.hasOwn`). `constructor`, `__proto__`, `x.constructor` etc. resolve to
"not defined", never to prototype internals. User node names may not shadow
the built-in node kinds (reserved-name validation), so `eval` dispatch cannot
be hijacked.

## Why not arktype (recorded intent)

An earlier iteration planned to validate constraint strings with arktype's
`type.validate<>`. That buys three things: open type *expressions*
(`"number>0"`), subtyping between them, and schema-syntax validation. The
current design deliberately chooses a **closed nominal vocabulary** instead:
validation needs no dependency, `sameAs`/`fromBinding` cover the polymorphism
that motivated richer constraints, and exact-match semantics are trivially
mirrorable in the type engine.

arktype becomes worth its weight only if open type expressions are added; that
would also change matching from equality to assignability — a semantic break
better taken deliberately (and pre-1.0) than inherited. Until then: type names
are opaque tags, related only by equality.

## Limits & non-goals (current)

- No subtyping between type names; no union-typed *outputs* (a ternary's
  branches must agree via `sameAs` rather than producing `"number | string"`).
- No incremental/streaming parse; inputs are expression-sized strings.
- ESM-only packaging.
- Type-level depth limits apply to literal-mode parsing only — see
  [Limits & rules](/stringent/guides/parsing-and-evaluation/#limits--rules).

## Roadmap candidates

- Open type expressions + assignability (the arktype direction), as a breaking
  semantic upgrade to constraint matching.
- Union output types with distributed constraint checking.
- A `many()`/separated-list pattern element (function-call argument lists).
- Positional token spans on AST nodes for editor tooling.
