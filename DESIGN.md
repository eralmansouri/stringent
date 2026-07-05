# Stringent — Design

This document describes the architecture and the reasoning behind it. It is
the contract the codebase is held to; if behavior and this document disagree,
one of them is a bug.

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

Every semantic construct — constraints, result types, associativity,
laziness — is **declarative data on the node schema**, never a function. This
is forced by the dual-engine design:

- Types drive *parsing*, not just results. When an operand slot constrained
  to `number` sees a `string` expression, the parser backtracks and tries
  another interpretation — mid-parse, in both engines.
- The runtime engine cannot see TypeScript types, and the type engine cannot
  execute functions. The only language both speak is data.

This is why a node's result type cannot be inferred from `eval`'s TypeScript
return type: the runtime engine needs the type name *as a string* while
parsing. What the design offers instead is **derivation** (below), which
recovers the inference ergonomics without breaking the law.

## Type system

### Vocabulary

Type names are plain strings, but the set of *valid* names is closed and
known at parser construction:

```
vocabulary = { static resultTypes of all nodes }
           ∪ { "number", "string", "boolean", "unknown" }   // built-in elements
           ∪ createParser options.types                      // schema-only types
```

Validation happens at three layers:

1. `createParser` throws for any constraint string outside the vocabulary
   (a typo'd `lhs("numbr")` is an immediate construction error, not a
   silently dead grammar rule).
2. Schema leaves are checked at **compile time**: the `schema` parameter of
   `parse`/`safeParse`/`evaluate` is bound by `SchemaShapeOf<TVocab>`, so
   `{ x: "numbr" }` errors at the leaf with the valid names in the message.
3. Schema leaves are re-checked at **runtime** (`safeParse` walks the
   schema), covering dynamically-built schemas. Schema errors throw — they
   are programmer errors, distinct from input errors, which never throw.

`"unknown"` is the type of unresolved identifiers/paths. Constrained slots
reject it, which is how "identifier not in schema" surfaces as a
`TYPE_MISMATCH` with the offending name.

### Constraints (operand slots)

`lhs` / `rhs` / `expr` accept:

| Form | Meaning |
|---|---|
| `lhs()` | unconstrained |
| `lhs("number")` | exact type name |
| `lhs(["number", "string"])` | any of the listed names (overloading) |
| `rhs(sameAs("left"))` | same type as an earlier named operand, whatever it parsed as |

Matching is **exact name equality** (`"number>0"` is not a subtype of
`"number"`; there is no subtyping). `sameAs` may only reference a binding
that appears *earlier* in the pattern (position 0 can never use it).
Constraint resolution therefore folds left-to-right through the pattern,
with the already-parsed children available — in both engines.

### Result types (what a node produces)

| Form | Meaning |
|---|---|
| `resultType: "boolean"` | static — the node mints a type |
| `resultType: fromBinding("then")` | derived — the node's type is whatever the named operand parsed as |
| omitted | only for passthrough patterns (single unnamed non-const element) |

`fromBinding` + `sameAs` + union constraints together give polymorphic
operators without per-type node variants:

```ts
// number+number → number, string+string → string, number+string → TYPE_MISMATCH
const add = defineNode({
  name: "add",
  pattern: [lhs(["number", "string"]).as("left"), constVal("+"), rhs(sameAs("left")).as("right")],
  precedence: 2,
  associativity: "left",
  resultType: fromBinding("left"),
  eval: ({ left, right }) => (left as any) + (right as any),
});
```

The derived `outputSchema` is computed per-parse, so `parser.evaluate("'a'+'b'", …)`
is typed `string` while `parser.evaluate("1+2", …)` is typed `number`.

### Why not arktype (recorded intent)

An earlier iteration planned to validate constraint strings with arktype's
`type.validate<>`. That buys three things: open type *expressions*
(`"number>0"`), subtyping between them, and schema-syntax validation. The
current design deliberately chooses a **closed nominal vocabulary** instead:
validation needs no dependency, `sameAs`/`fromBinding` cover the polymorphism
that motivated richer constraints, and exact-match semantics are trivially
mirrorable in the type engine. arktype becomes worth its weight only if open
type expressions are added; that would also change matching from equality to
assignability — a semantic break better taken deliberately (and pre-1.0) than
inherited. Until then: type names are opaque tags, related only by equality.

## Parsing model

- **Grammar** = precedence levels sorted ascending (lowest binds loosest,
  parsed first, outermost in the tree), atoms last. Precedence is a
  non-negative safe integer or `"atom"`. Duplicate precedences share a level;
  nodes within a level are tried in definition order with backtracking.
- **Roles**: `lhs` parses at the next level up (prevents left recursion);
  `rhs` parses at the current level (right associativity) or, on left levels,
  the next level up; `expr` resets to the full grammar (parens, ternary
  branches, call arguments).
- **Associativity** is a property of a *level* (mixing within a level is a
  construction error). Right (default): recursive descent, `a^b^c` =
  `a^(b^c)`. Left: seed an operand from the next level, then iteratively fold
  `op operand` — `a-b-c` = `(a-b)-c`. The fold re-checks each candidate
  node's lhs constraint against the folded-so-far result every iteration, so
  heterogeneous operators can share a level. The type-level fold is written
  in tail position, so long left chains grow TS's iteration budget (~1000),
  not its instantiation depth (~50).
- **Whitespace** is skipped before tokens (parsebox behavior), with one
  deliberate exception: no whitespace around `.` in paths. `values .password`
  ends the path after `values`; `values. password` and `values.` fail the
  element.
- **Construction-time validation** (`createParser` throws): duplicate or
  reserved node names (`literal`, `identifier`, `path`, `const`); invalid
  precedence; mixed associativity in a level; left patterns not shaped
  `[lhs, ...rest]`; `rhs`/`expr` at position 0 (guaranteed infinite
  recursion); atoms starting with expression elements; `constVal("")`;
  `sameAs` referencing a missing/later binding; `fromBinding` referencing a
  missing binding; missing `resultType` where one is required; constraint
  strings outside the vocabulary.

## Evaluation model

`evaluate`/`evaluateAst` walk the AST post-order: literals yield their
values, identifiers/paths look up the values object, named-binding children
evaluate first, then the node's `eval(bindings, values)` runs. The parsed
`outputSchema` types the result (`SchemaToType`), so evaluation is typed
end-to-end for literal inputs.

- **Laziness**: `lazy: true` makes `eval` receive memoized thunks
  (`() => value`) instead of values — this is how ternary/`&&`/`||`
  short-circuit. Eager is the default; laziness is per-node and visible in
  `eval`'s parameter types.
- **Security posture**: expressions are untrusted input. All identifier and
  path lookups — in the evaluator *and* in parse-time schema resolution —
  use own-property checks (`Object.hasOwn`). `constructor`, `__proto__`,
  `x.constructor` etc. resolve to "not defined", never to prototype
  internals. User node names may not shadow the built-in node kinds
  (reserved-name validation), so `eval` dispatch cannot be hijacked.

## Error model

`safeParse` never throws for input; it returns `{ success: false, error }`
with:

- `code`: `PARSE_ERROR` (no interpretation matched), `TYPE_MISMATCH`
  (an expression parsed but a constraint rejected it), `UNEXPECTED_INPUT`
  (a prefix parsed; trailing input remains)
- `position` (0-based), `expected` (token descriptions), `found` (snippet)

Ranking: the parser records the **furthest** token failure plus the
furthest-reaching constraint mismatch *span*. A mismatch wins when its span
reaches both the stuck position and the furthest token failure — otherwise
it is backtracking noise (e.g. a ternary probing whether `1` is boolean) and
the token story wins. `parse()`/`evaluate()` throw `StringentParseError`
(same fields) when their compile-time guarantee is bypassed; the evaluator
throws `EvaluationError` for undefined identifiers/paths and missing `eval`.

## Dual-engine parity

The two engines are hand-mirrored, function-for-function
(`ParseLevels` ↔ `parseLevels`, `ResolveSpec` ↔ `resolveConstraintSpec`,
`ResultSchemaOf` ↔ `resultSchemaOf`, …). Parity is enforced by twin test
suites over a shared fixture grammar: `src/parser.test.ts` (runtime ASTs)
and `src/types.typetest.ts` (the same expressions' types). Any grammar
feature must land in both engines and both suites in the same commit.

Known engine-behavior notes:

- Optional properties in schema types must be matched with `prop?:` in
  conditional types — matching them as required silently never matches
  (this caused two real bugs; see `NormalizeConstraint` and
  `ResultSchemaOf`).
- Type-level input length: left-associative chains handle 100+ terms;
  right-associative/deeply-nested expressions recurse per level and hit
  TS2589 around a few dozen tokens. The runtime engine has no such limit.
- `parse()` accepts trailing whitespace, exactly like `safeParse`.

## Limits & non-goals (current)

- No subtyping between type names; no union-typed *outputs* (a ternary's
  branches must agree via `sameAs` rather than producing `"number | string"`).
- No incremental/streaming parse; inputs are expression-sized strings.
- ESM-only packaging.
- Type-level depth limits above apply to literal-mode parsing only.

## Roadmap candidates

- Open type expressions + assignability (the arktype direction), as a
  breaking semantic upgrade to constraint matching.
- Union output types with distributed constraint checking.
- A `many()`/separated-list pattern element (function-call argument lists).
- Positional token spans on AST nodes for editor tooling.
