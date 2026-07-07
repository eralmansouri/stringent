# Stringent — Design (v2)

This document describes the architecture and the reasoning behind it. It is
the contract the codebase is held to; if behavior and this document disagree,
one of them is a bug. (The v1→v2 redesign is chronicled in V2-PLAN.md; this
document describes the result.)

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

Every semantic construct — constraints, result types, associativity,
laziness — is **declarative data on the node schema**, never a function. This
is forced by the dual-engine design:

- Types drive *parsing*, not just results. When an operand slot constrained
  to `number` sees a `string` expression, the parser backtracks and tries
  another interpretation — mid-parse, in both engines.
- The runtime engine cannot see TypeScript types, and the type engine cannot
  execute functions. The only language both speak is data.

This is why a node's result type cannot be inferred from `eval`'s TypeScript
return type: the runtime engine needs the type *as data* while parsing. What
the design offers instead is **derivation** (binding references, below),
which recovers the inference ergonomics without breaking the law.

## Type system

### Types are arktype definitions

Constraints, result types, and schemas are [arktype](https://arktype.io)
definitions — `"number"`, `"string | number"`, `"string.email"`,
`{ min: "number", max: "number" }`. Each parser owns a compiled **type
environment** (`src/runtime/types.ts`): an arktype scope containing the
keyword library plus the aliases passed as `createParser(nodes, { scope })`.
Every distinct definition is compiled once and cached; assignability and
overlap verdicts are memoized per expression pair.

Validation happens at three layers:

1. `createParser` throws for any constraint or resultType that is neither an
   earlier binding name nor a definition resolvable in the parser's scope (a
   typo'd `operand("numbr")` is an immediate construction error, not a
   silently dead grammar rule).
2. Schema leaves are checked at **compile time** via `type.validate` on
   `safeParse` (a typo'd `{ x: "numbr" }` errors at the leaf).
   `parse`/`evaluate` cannot carry that validator — arktype's `validate` as
   a sibling of the conditionally-typed input parameter poisons generic
   inference (measured; see V2-PLAN.md) — so bad leaves there surface
   through the input check and at runtime.
3. Schemas are compiled at **runtime** in the parser's scope, covering
   dynamically-built schemas. Schema errors throw — they are programmer
   errors, distinct from input errors, which never throw.

`"unknown"` is the type of unresolved identifiers/paths. Constrained slots
reject it, which is how "identifier not in schema" surfaces as a type
mismatch naming the offender. Unconstrained slots (and symmetric checks
against unconstrained operands) accept unknown operands; grammars that want
unresolved identifiers rejected structurally should constrain their slots.

### Constraint satisfaction is assignability

An operand satisfies a slot when its parsed type is **assignable to** the
constraint — `candidate.extends(constraint)` at runtime, and
`type.infer<candidate> extends type.infer<constraint>` over literal
definition strings at compile time (literal defs keep TypeScript's
memoization effective; see the Phase 0 spike). `'number > 0'` satisfies a
`'number'` slot; there is no name equality anywhere.

`operand` / `rest` / `expr` accept:

| Form | Meaning |
|---|---|
| `operand()` | unconstrained |
| `operand("number")`, `operand("string \| number")` | any arktype def in the parser's scope |
| `rest("left")` | **binding reference** — assignable to whatever the earlier operand `left` parsed as (directional: candidate ⊆ left) |
| `rest(overlapping("left"))` | **symmetric** binding reference — the types must overlap (some value could inhabit both), for equality-style operators where operand order must not matter |

A binding reference must name an element *earlier* in the pattern (position
0 can never reference). Constraint resolution folds left-to-right through
the pattern with the already-parsed children available — in both engines.

References also work EMBEDDED in larger defs: `rest("left | null")`,
`resultType: "left | null"`, `resultType: { value: "left" }`. Such
"template" defs are resolved per parse in a scope extended with the parsed
sibling types — `scope({ left: <parsed> }).type("left | null")` at runtime
(memoized by def + alias expressions), `type.infer<"left | null",
{ left: … }>` at the type level. TS union normalization gives chained
templates a fixed point, so the cost is ~10 instantiations per resolution
(measured; spike/union-defs). One representational consequence: a TS type
cannot be turned back into a def string, so at the type level a template
node's `outputSchema` is a resolved-type carrier (`{ "~resolved": T }`,
a reserved key) while the runtime displays arktype's normalized
expression — display parity is not part of the contract.

### Refinements are validation-only

Arktype refinements (`"number > 0"`, `"string.email"`) erase to their base
TypeScript types at compile time, so if the runtime checked them during
parsing, `parse()`'s promise ("if it compiles, it parses") would break.
Expression *typing* therefore runs on erased types in **both** engines
(runtime: `eraseRefinements` in `src/runtime/types.ts` — the codebase's one
`.internal` touchpoint; compile time: automatic via `type.infer`).
Refinements do their real job at the values boundary: `evaluate()` and
compiled rules validate the values object against the full, un-erased
schema.

### Result types (what a node produces)

| Form | Meaning |
|---|---|
| `resultType: "boolean"` | static — the node mints a type (any arktype def, string or object) |
| `resultType: "then"` | derived — the node's type is whatever the operand bound as `then` parsed as |
| omitted | only for passthrough patterns (single unnamed non-const element), which forward a child and construct nothing — declaring a type there would be a lie, so it is forbidden |

Derived `outputSchema` is computed per-parse: `evaluate("'a'+'b'", …)` is
typed `string` while `evaluate("1+2", …)` is typed `number`. The AST's
`outputSchema` stays serializable data; the compiled arktype `Type` rides
alongside on a non-enumerable symbol (`OUTPUT_TYPE`), invisible to JSON and
deep-equality assertions.

### Eval typing: correlated bindings

`eval` receives typed bindings derived from the pattern. Reference-linked
bindings are **correlated**: the bindings parameter is a distributed union
over the root operand's constraint members —

```ts
pattern: [operand("number | string").as("left"), constVal("+"), operand("left").as("right")]
// eval receives: { left: number; right: number } | { left: string; right: string }
```

Correlation granularity is **definition-level**: `"string | number"` splits
into two branches; `"boolean"` stays one branch (splitting into
`true | false` would claim value-level correlation the parser never
enforces). Reference chains (`a ← b ← c`) form one group; multiple groups
cross-product.

TypeScript does **not** narrow sibling properties through `typeof b.left`
(discriminant narrowing needs unit types — verified against TS 5.9), so the
idiomatic polymorphic eval is arktype's `match`, one case per union branch:

```ts
const addImpl = match
  .in<InferEvaluatedBindings<typeof addPattern>>()
  .case({ left: "number", right: "number" }, (b) => b.left + b.right)
  .case({ left: "string", right: "string" }, (b) => b.left + b.right)
  .default("assert");

// eval is CALLED as (bindings, runtimeValues) — wrap the matcher, or
// arktype reads the second argument as its internal traversal context:
eval: (b) => addImpl(b)
```

Known hole (documented, accepted): runtime values can straddle branches
when a union-typed schema identifier fills either side (`x + 1` with
`x: "string | number"` holding a string). Same pragmatic unsoundness TS
accepts for correlated unions; `.default("assert")` turns it into a runtime
error.

`eval`'s **return type** is verified against the declared `resultType` at
the `defineNode` call site (binding references and object defs included).
At runtime, dev mode (below) re-asserts it for plain-JS users.

## Parsing model

- **Grammar** = precedence levels sorted ascending (lowest binds loosest,
  parsed first, outermost in the tree). Precedence is a non-negative safe
  integer; the **highest level present is the leaf level**, whose patterns
  must start with a consuming element. Duplicate precedences share a level;
  nodes within a level are tried in definition order with backtracking —
  keyword-literal nodes must precede identifier/path nodes, or `true`
  parses as an identifier.
- **Roles** name the grammar level a slot parses at: `operand()` parses at
  the next tighter level (prevents left recursion); `rest()` parses at the
  current level; `expr()` resets to the full grammar. `expr()` must be
  followed by a `constVal` in the same pattern — it is only sound in
  delimiter-bounded regions (parens' `)`, ternary's `:`); an undelimited
  `expr()` tail would swallow looser operators and break precedence.
- **Associativity is derived from the pattern's tail shape**; there is no
  `associativity` property. A level whose patterns end in `operand()` (or a
  consuming element) folds **left**: seed an operand from the next level,
  then iteratively fold `op operand` — `a-b-c` = `(a-b)-c`. A level whose
  patterns end in `rest()` recurses **right**: `a^b^c` = `a^(b^c)`. Mixing
  tail shapes within a level is a construction error. The left fold
  re-checks each candidate's leading constraint against the folded-so-far
  result every iteration, so heterogeneous operators can share a level; the
  type-level fold is written in tail position, so long left chains grow
  TS's iteration budget (~1000), not its instantiation depth (~50).
- **Built-in literals**: `number()`, `string(quotes)`, `boolean()`
  (true/false), `nullVal()`, `undefinedVal()`, `ident()`, `path()`,
  `constVal(text)`. Keyword literals match as *whole identifiers*
  (`nullable` is one identifier, never `null` + `able`) and carry their
  base types (`"boolean"`, not unit `true` — literal result types are a
  roadmap item). String literals process escapes (`\n \t \r \\ \" \' \`
  \0 \b \f \v \xHH \uHHHH`); unknown escapes resolve to the escaped
  character, JS-style.
- **Whitespace** is skipped before tokens, with one deliberate exception:
  no whitespace around `.` in paths. `values .password` ends the path after
  `values`; `values. password` and `values.` fail the element.
- **Construction-time validation** (`createParser` throws): duplicate or
  reserved node names (`literal`, `identifier`, `path`, `const`); invalid
  precedence; mixed tail shapes in a level; left-level patterns not
  starting with `operand(...)`; `rest`/`expr` at position 0 (guaranteed
  infinite recursion); leaf patterns starting with expression elements;
  `constVal("")`; undelimited `expr()`; binding names that collide with AST
  structure (`node`, `outputSchema`, `__proto__`), repeat within a pattern,
  or shadow a resolvable type in scope; references to missing/later/const
  bindings; missing `resultType` where required (or present on a
  passthrough); constraints/resultTypes that don't resolve in scope;
  unsatisfiable constraint intersections (arktype throws; re-raised as
  grammar errors).

## Evaluation model

`evaluate`/`evaluateAst` walk the AST post-order: literals yield their
values, identifiers/paths look up the values object, named-binding children
evaluate first, then the node's `eval(bindings, values)` runs. The parsed
`outputSchema` types the result, so evaluation is typed end-to-end for
literal inputs. `evaluate()` validates the values object against the full
schema (refinements included) before evaluating.

- **Laziness**: `lazy: true` makes `eval` receive memoized thunks
  (`() => value`) instead of values — this is how ternary/`&&`/`||`
  short-circuit. Eager is the default; laziness is per-node and visible in
  `eval`'s parameter types.
- **Dev-mode result assertions**: `createParser(nodes, { dev })` — on by
  default outside `NODE_ENV=production` — asserts each user node's eval
  output against the node's per-parse resolved Type via precompiled
  `allows()` (~16ns/node). This is the runtime complement of the
  compile-time eval-return check, for plain-JS users. Failure messages
  describe the value's *shape* only (never the value — it may be a secret).
  Deserialized ASTs carry no attached Types and skip the check.
- **Security posture**: expressions are untrusted input. All identifier and
  path lookups — in the evaluator *and* in parse-time schema resolution —
  use own-property checks (`Object.hasOwn`). `constructor`, `__proto__`,
  `x.constructor` etc. resolve to "not defined", never to prototype
  internals. User node names may not shadow the built-in node kinds
  (reserved-name validation), so `eval` dispatch cannot be hijacked.

## Rules as arktype Types (`parser.compile`)

`parser.compile(input, schema, { path?, message? })` compiles a rule into a
real arktype `Type` — and arktype Types are Standard Schemas, so a stringent
rule drops directly into react-hook-form, tRPC, hono, oRPC:

- A rule whose output type is **boolean** becomes a **predicate** Type: it
  validates the values object against the (refined) schema, evaluates the
  rule, and rejects with an ArkErrors entry at `options.path` when the rule
  is false (`actual: ""` keeps runtime values out of messages). Values in,
  values out — exactly what a form resolver wants.
- Any other rule becomes a **morph** Type: values in, evaluated result out.
- `.in` is the values contract; `rule.in.toJsonSchema()` exports it (for
  predicate rules pass `{ fallback: { predicate: (ctx) => ctx.base } }` —
  the predicate node itself is not JSON-Schema-representable).
- Unlike `parse`/`evaluate`, `compile` accepts dynamic strings (rules live
  in config); invalid input throws `StringentParseError`. Literal inputs
  additionally get precise compile-time typing (`Type<values>` for
  predicates, `Type<(In: values) => Out<result>>` for morphs).

## Error model

Two error domains, each using the representation built for it:

- **Parse-time** failures are stringent's positioned diagnostics.
  `safeParse` never throws for input; it returns `{ success: false, error }`
  with `code` (`PARSE_ERROR` — no interpretation matched; `TYPE_MISMATCH` —
  parsed but a constraint rejected it; `UNEXPECTED_INPUT` — a prefix parsed,
  trailing input remains), `position` (0-based), `expected`, `found`.
  `parse()`/`evaluate()`/`compile()` throw `StringentParseError` (same
  fields).
- **Data-time** failures are **ArkErrors**: schema validation in
  `evaluate()` and everything produced by compiled rules (serializable,
  `flatByPath` for per-field form state, field-path attribution via
  `ctx.reject({ path })`). The evaluator itself throws `EvaluationError`
  for undefined identifiers/paths, missing `eval`, and dev-mode result
  assertion failures.

Ranking: the parser records the **furthest** token failure plus the
furthest-reaching constraint mismatch *span*. A mismatch wins when its span
reaches both the stuck position and the furthest token failure — otherwise
it is backtracking noise (e.g. a ternary probing whether `1` is boolean) and
the token story wins.

Known ranking weakness (tracked): unclosed delimiters (`"(1"`, `"(1))"`)
can report a speculative constraint mismatch (a low-precedence rule probing
its condition) instead of the missing/stray delimiter, because the mismatch
span ties the delimiter failure at end-of-input. A proper fix needs a
credibility signal on mismatches (e.g. only prefer one whose pattern also
matched its following token); until then delimiter errors may read as type
errors.

## Dual-engine parity

The two engines are hand-mirrored, function-for-function
(`ParseLevels` ↔ `parseLevels`, `ResolveSpec` ↔ `resolveConstraint`,
`ResultSchemaOf` ↔ `buildNodeResult`, `ScanString` ↔ `scanString`, …).
Parity is enforced by twin test suites over a shared fixture grammar:
`src/parser.test.ts` (runtime ASTs) and `src/types.typetest.ts` (the same
expressions' types). Any grammar feature must land in both engines and both
suites in the same commit.

Parity is over **accept/reject decisions and inferred TypeScript types**,
not display strings: type-level `outputSchema` carries the definition as
written, while the runtime displays arktype's normalized `expression`.

Deliberate engine divergences (all conservative — the type level rejects
things the runtime accepts, never vice versa):

- `\xHH`/`\uHHHH` string escapes decode at runtime only; hex cannot be
  decoded at the type level, so literal-mode parsing rejects them (use
  `safeParse`).
- Definitions using `createParser`'s `scope` aliases resolve at runtime
  only; compile-time validation and literal-mode parsing use arktype's
  default scope, so scope-alias grammars need `as never` at compile time
  (threading the scope through `type.validate` is an open work item).
- Type-level input length: left-associative chains handle 30+ terms
  (tail-recursive fold; canary at 30). Everything that recurses per level
  pays instantiation depth proportional to the level count: on the 6-level
  fixture grammar, right-associative chains handle ~8 terms and `expr()`
  nesting (parens, ternary branches) ~3 levels deep before TS2589. Fewer
  precedence levels stretch these limits; the runtime engine has none.
  Canaries in `types.typetest.ts` pin the measured floor.
- `parse()`'s compile-time guarantee assumes literal schema types. A
  schema typed as a wide `Record<string, "number">` makes the type engine
  resolve every identifier optimistically, so an invalid literal can
  compile and then throw `StringentParseError` at runtime — an inherent
  structural-typing limit. Similarly, a `__proto__` key in a schema object
  literal is visible to the type engine but creates no own property at
  runtime. Use literal schemas with `parse()`; use `safeParse()` otherwise.
- Type-level overlap is approximated as a non-never TS intersection, which
  diverges from arktype for object types with disjoint property types (TS
  does not reduce those to `never`). Corner case, noted in
  `src/parse/index.ts`.

## Limits & non-goals (current)

- Union-typed outputs exist only where DECLARED (template resultTypes like
  `"left | null"`); a ternary's disagreeing branches still don't
  auto-synthesize `"number | string"` — they must agree via a reference.
- Eval-binding typing for template constraints/resultTypes is conservative
  (`unknown`): correlation and eval-return checking see through
  whole-string references only.
- Evaluation is synchronous (arktype morphs cannot be async); async
  operators must be promise-valued outputs handled by the caller.
- No incremental/streaming parse; inputs are expression-sized strings.
- ESM-only packaging.
- Type-level depth limits above apply to literal-mode parsing only.

## Roadmap candidates

- Auto-synthesized union outputs (disagreeing ternary branches producing
  `"number | string"` instead of failing); template defs already cover the
  declared-union cases.
- Precise eval typing through template defs (currently `unknown`).
- Function-call operators via arktype's `type.fn`, paired with a
  `many()`/separated-list pattern element (argument lists).
- Literal result types (number/string/boolean literals as arktype unit
  types) for constant folding and exact-value comparison.
- JSON Schema import (`@ark/json-schema`) to bootstrap a stringent schema
  from an existing document.
- Scope-aware compile-time validation (threading `createParser`'s aliases
  through `type.validate`/`Parse`).
- Positional token spans on AST nodes for editor tooling; identifier
  autocomplete via the schema's properties.
