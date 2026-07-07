# Stringent v2 — API Redesign Plan

Status: **Phases 0–3 implemented and green** on branch
`claude/formeddable-stringent-review-suiwqu` (see the Session Handoff
section at the bottom for exact state). Decisions below came out of a
design review comparing this repo against the archived
formeddable/stringent (Jan 2026, arktype-based) and a discussion of v1's
ergonomics. DESIGN.md still describes v1 and needs its rewrite in Phase 7.

## Goals

1. **Nice to use.** No marker objects (`sameAs`, `fromBinding`,
   `{ union: [...] }`), no casts in `eval`, no jargon (`"atom"`), no
   redundant config fields.
2. **Real type expressions.** Constraints and result types are arktype
   expressions; binding names are automatically in scope as type aliases.
3. **Assignability, not name equality.** `'number > 0'` satisfies a
   `'number'` slot.
4. **Keep everything that makes v1 good:** the dual-engine law (semantics
   are data), `safeParse` diagnostics, lazy thunks, prototype-pollution
   guards, packaging discipline.

## Decision log

| # | Decision | Rationale |
|---|---|---|
| D1 | Adopt `arktype` as the type-expression engine (runtime scopes/validators + `type.validate`/`type.infer` at compile time). | Gets union types, refinements, and assignability for free; the archived formeddable repo is a working reference for the integration (and its pitfalls — it did string-equality checks instead of real assignability; we won't). |
| D2 | Binding names are auto-scoped type aliases. `rhs('acc')` means "assignable to whatever `acc` parsed as"; `resultType: 'then'` means "the type `then` parsed as". | Replaces `sameAs()` and `fromBinding()` with plain type expressions. One vocabulary everywhere. |
| D3 | `resultType` is **always required**, and is any arktype definition — a string expression (`'boolean'`, `'then'`) or an object def (`{x: 'number', y: 'number'}` for a node producing a structured value). Binding aliases resolve inside both forms. | Considered inference-from-eval (impossible for dynamic parsing — TS types are erased and the parser needs result types as data mid-parse to backtrack) and conditional optionality (needs a pattern-classification meta-rule mirrored in both engines; "why is it forbidden here?" moments). One rule, self-documenting grammars. |
| D4 | `eval` is **verified against** `resultType` at compile time; wrong return type is an error at the `defineNode` call site. Dev-mode runtime assertion via `.allows()` covers plain-JS users. | Inference-grade safety without breaking the semantics-are-data law. |
| D5 | Correlated eval bindings: the bindings parameter is typed as a **distributed union** (`{acc: string, append: string} \| {acc: number, append: number}`), generated from the pattern's binding links. | Kills the `as any` in polymorphic evals (`__fixtures__/grammar.ts:90`). Narrow through the object (`typeof b.acc === 'string'`), then destructure. |
| D6 | **Associativity is derived from the tail element's level; the `associativity` property is deleted.** Tail at tighter level (`lhs()`) → left-assoc via fold; tail at current level (`rhs()`) → right-assoc; `expr()` → delimited slots only. | v1 already reinterprets a left level's `rhs()` tail to parse at the next level (`runtime/parser.ts:634`) — the label lies. Deriving from shape makes the pattern the single source of truth. Level coherence check: all nodes at a level must agree on tail shape (replaces the mix-associativity error). |
| D7 | `precedence` is a plain number; the `"atom"` sentinel is removed. The **highest** precedence level is the leaf level; built-in literals live there implicitly. | "Atom" is jargon; the only thing it encoded (recursion base, no leading expression element) is enforceable by validating the max level. |
| D8 | Built-in literals gain `true`/`false`/`null`/`undefined` alongside number/string. | Biggest functional gap vs. the archive. Port the keyword-prefix-guard approach (so `nullable` ≠ `null` + `able`) in both engines. |
| D9 | String escape handling (`\n \t \r \\ \" \' \0 \b \f \v \xHH \uHHHH`) in the runtime tokenizer, with the archive's 405-line test corpus ported. | v1 delegates to parsebox raw tokens; escapes silently don't work. |
| D10 | Versioning: **0.0.x forever** (owner directive, 2026-07-07). v2 ships as the next 0.0.x patch. Never publish 0.1 or any 0.x minor, regardless of readiness. | Owner preference; unrelated to code state. |
| D11 | **Schemas are arktype scopes/Types**, not a custom record-walking system. Identifier/path resolution uses `Type.get('address', 'zip')`; the legal-identifier set is `schema.keyof()`; nested access maps onto (rooted) submodules; `onUndeclaredKey: 'reject'` gives a strict no-undeclared-variables mode. `createParser(nodes, { scope })` accepts a user scope/module, which also makes arktype's keyword library (`string.email`, `number.integer`, …) valid in constraints for free. | Replaces v1's hand-rolled `resolveIdent`/`resolvePath`/`validateSchema` subsystem with public, typed arktype primitives. |
| D12 | **A compiled rule is exposed as an arktype `Type`** (`parser.compile(input, schema)` → a Type whose input is the values schema and whose morph is evaluation; cross-field predicate rules lower to `narrow` with `ctx.reject({ path })`). | The integration story: a stringent rule becomes a Standard Schema, so it drops directly into react-hook-form (`arktypeResolver`), tRPC `.input`, hono, oRPC. `.in` introspects which variables a rule reads; `.in.toJsonSchema()` exports the form contract. |
| D13 | **Evaluation/validation failures are `ArkErrors`** (serializable, `flatByPath` for per-field form state, `hasCode()` for programmatic handling, `actual: () => ''` to keep secret values out of messages). Parse-time failures remain stringent's own positioned `StringentError` diagnostics. | Two error domains, each using the representation built for it: source positions for parse errors, field paths for data errors. |
| D14 | **Polymorphic eval may be written with arktype's `match`** (`match({ '{acc: string, append: string}': …, '{acc: number, append: number}': …, default: 'never' })`) as the idiomatic style; plain functions with narrowing stay supported. | Kills typeof chains while preserving correlation; match compiles to set-theory-discriminated dispatch (docs: ~9ns/case vs ~765ns for ts-pattern). |
| D15 | **Runtime type relations use arktype set operations**: constraint matching = `candidate.extends(slot)` (with `ifExtends` driving backtracking); `overlaps` powers a new `createParser`-time **grammar ambiguity lint** (two nodes at one level whose operand types overlap); unit reduction gives static "this rule can never pass" detection when constraints intersect to `never`. | The runtime gets the same set-theory semantics TS applies at compile time, from public APIs — no `.internal` walking needed for the core path (respects the no-refinements-in-constraints assumption). |

## API sketch — the fixture grammar in v2

```ts
const parens = defineNode({
  name: 'parens',
  pattern: [constVal('('), expr().as('inner'), constVal(')')],
  precedence: 6,                       // leaf level (highest number present)
  resultType: 'inner',
  eval: (b) => b.inner,
})

const eq = defineNode({
  name: 'eq',
  pattern: [lhs().as('left'), constVal('=='), rhs('left').as('right')],
  precedence: 1,
  resultType: 'boolean',
  eval: (b) => b.left === b.right,
})

const add = defineNode({
  name: 'add',
  pattern: [lhs('string | number').as('acc'), constVal('+'), lhs('acc').as('append')],
  //        tail is lhs() → left-associative fold, no property needed
  precedence: 2,
  resultType: 'acc',
  eval: (b) => typeof b.acc === 'string' ? b.acc + b.append : b.acc + b.append,
  //           ^ correlated bindings: both string or both number, no casts
})

const pow = defineNode({
  name: 'pow',
  pattern: [lhs('number').as('base'), constVal('**'), rhs('number').as('exp')],
  //        tail is rhs() → right-associative
  precedence: 4,
  resultType: 'number',
  eval: (b) => b.base ** b.exp,
})

const ternary = defineNode({
  name: 'ternary',
  pattern: [lhs('boolean').as('cond'), constVal('?'), expr().as('then'),
            constVal(':'), rhs('then').as('else')],
  precedence: 0,
  lazy: true,
  resultType: 'then',
  eval: (b) => b.cond() ? b.then() : b.else(),
})
```

Deleted from v1: `sameAs()`, `fromBinding()`, `associativity`, `"atom"`.
Unchanged: `defineNode`/`createParser` shape, `.as()` naming, `lazy`,
`parse`/`safeParse`/`evaluate`/`evaluateAst`, diagnostics model.

## Semantics

### Scoping & collisions
- Per-node scope = built-in element types ∪ node result types ∪
  `createParser` option scope ∪ **earlier bindings of this pattern**.
- A binding may only be referenced by *later* elements (same fold order both
  engines; position 0 can never reference — same rule as v1 `sameAs`).
- Collisions are construction errors: a binding named like a scope type
  (`.as('number')`, `.as('boolean')`) throws at `createParser`. Reserved
  binding names (`node`, `outputSchema`, `__proto__`) stay reserved.

### Constraint satisfaction = assignability
- Runtime: compile each distinct type definition once (cached), check
  candidate-output ⊆ constraint.
- Compile time: TS assignability on `type.infer<candidate> extends
  type.infer<constraint>` as the proxy.
- **Refinements are validation-only.** Arktype refinements (`'number > 0'`,
  `'string.email'`) erase to their base TS type at compile time, so if the
  runtime checked them during parsing, `parse()`'s promise ("if it compiles,
  it parses") would break: with schema `{age: 'number'}` and a slot
  constrained `'number >= 0'`, the literal `age!` typechecks (`number
  extends number`) but runtime assignability rejects it. The fix is
  principled, not a workaround: expression *typing* runs on erased
  (TS-exact) types in **both** engines, and refinements apply where they are
  actually meaningful — validating the `values` object at evaluation time.
  (Refinement-level typing of expressions is not even well-defined:
  arithmetic doesn't preserve refinements — the "type" of `a + b` for two
  `'number > 0'` operands erases after one operation anyway.)

### Result type resolution
Per parse, after all bindings resolve: substitute each binding's parsed type
into the node's `resultType` expression and normalize. The AST's
`outputSchema` remains a string (display + data), with the compiled Type
cached alongside.

### Associativity by shape
- Level's tail shape: `lhs()`-tail levels use the iterative fold
  (`parseLeftLevel`, unchanged mechanics — the tail already parses at
  nextLevels there); `rhs()`-tail levels use recursive descent.
- Patterns with no expression tail (postfix, e.g. `[lhs(), constVal('!')]`)
  fold naturally (repetition = left).
- Construction error when nodes at one precedence level disagree on tail
  shape.

## ArkType usage discipline (from docs review)

Rules the implementation must follow, sourced from arktype's own docs:

- **Compose, don't transform.** `.or`/`.pipe`/string-embedded syntax/spread-
  `merge` create cheap referencing Types; `.configure`/`.onUndeclaredKey`/
  `.and` require full traversal and are expensive both at runtime and
  in-editor. Inside a recursive parser every avoided transform is multiplied
  across the tree. Prefer `merge` over intersection for non-overlapping
  props.
- **Compile once, cache forever.** Types JIT-precompile validators on
  instantiation (`new Function`); every distinct constraint/resultType
  definition is compiled once per parser and reused. Expose arktype's
  `jitless` config for `new Function`-hostile environments (CF Workers).
- **Depth escape hatch.** Mirror arktype's own `regex.as<>()` pattern: a
  `parser.parse.as<Result>(input, schema)` form that skips type-level
  parsing for expressions that hit TS2589, without losing runtime checking.
- **Stability adapter.** `.internal`/`select`/`@ark/schema` are explicitly
  not semver-frozen. The core path needs none of them (D15 uses public set
  ops); anything that does (introspection tooling, editor autocomplete via
  `.props`) goes behind one adapter module with a compatibility test, and
  arktype gets pinned with a renovate rule.
- **Evaluation stays synchronous.** Arktype morphs cannot be async (FAQ);
  async operators (e.g. DB lookups) must be promise-valued outputs handled
  outside the morph pipeline — out of scope for v2.
- **Morph/union caveat.** Overlapping unioned morphs are a `ParseError` in
  arktype; when lowering rules to Types (D12), keep overload branches
  non-overlapping in input or identical in transform.

## Phases

**Phase 0 — Spike (go/no-go). ✅ DONE — GO.** Results in
`spike/phase0/RESULTS.md`. Decision: **full arktype at compile time** (no
hybrid needed) — with a finite grammar def set, TS memoizes assignability
checks, so marginal per-parse-step cost is ~zero (500-deep recursion with
per-level checks: +3k instantiations over control, no TS2589); one-time
cost ~1.2k instantiations per distinct def. All D11–D15 runtime APIs
verified. Three corrections folded into the design: `match` object cases
use the fluent `.case()` API (object literals aren't string-embeddable as
case keys); unsatisfiable constraint intersections **throw at construction**
(try/catch in `createParser`, re-raise as grammar error); `extends()` isn't
internally memoized (~0.6µs raw) — backtracking memoizes verdicts per
(candidate, constraint) pair (~160ns). Constraint checks in the type engine
must be expressed over literal def strings so TS memoization applies.

**Phase 1 — Schema layer. ✅ DONE** (`src/schema/index.ts`,
`src/runtime/compile.ts`, `src/createParser.ts`). New element factories
(`sameAs`/`fromBinding`/`associativity`/`"atom"` deleted), binding-reference
constraints, required `resultType` (string or object def), scope/collision
validation, tail-shape coherence, numeric precedence with
max-level-is-leaf. Deviations recorded during implementation:
- Single-element passthrough patterns (e.g. `[number()]`) *forbid*
  `resultType` — they forward a child rather than construct a result, so
  there is nothing to declare (the one principled exception to D3).
- Array constraints (`lhs(["number","string"])`) dropped in favor of union
  defs (`lhs("number | string")`).
- A binding reference must currently be the WHOLE constraint/resultType
  string (`"then"`); references embedded in larger defs (`"then | else"`,
  `{ value: "acc" }`) are deferred until union output types.
- Binding-reference constraints are DIRECTIONAL (candidate ⊆ referenced
  binding's type), replacing v1's symmetric exact-equality `sameAs`.

**Phase 2 — Runtime engine. ✅ DONE** (`src/runtime/parser.ts`,
`src/runtime/types.ts`). Assignability-based constraint matching with
memoized verdicts; per-parse resultType resolution; associativity-by-shape
dispatch; leaf-level handling; parsed Types ride on a non-enumerable
symbol (AST stays serializable); diagnostics carry type expressions.
Refinement erasure (D-semantics) is implemented in the `types.ts` adapter
via `internal.transform` + `type.schema(json)` round-trip — the one
`.internal` touchpoint, per the stability rule.

**Phase 3 — Type engine. ✅ DONE** (`src/parse/index.ts`,
`src/grammar/index.ts`). Full literal-mode parsing restored: numeric
grammar computation (leaf level last; widened/never precedences resolve
the grammar to `never` instead of recursing), tail-shape associativity
with the tail-recursive left fold, assignability via
`type.infer<candidate> extends type.infer<constraint>` over literal defs
(memoization per the spike), overlap checks as non-never intersections,
binding-reference resolution against the parsed prefix, def-carrying
outputSchema (display strings may differ from the runtime's normalized
expressions; parity is accept/reject + inferred types). Measured floors
pinned as canaries: 30-term left chains (60 verified), 8-term right pow
chains (12 verified), 3-deep parens (4 hits TS2589 — same class as v1).
Two TS inference gotchas discovered and worked around, both measured:
arktype's `type.validate` or bare `type.infer` as a SIBLING parameter of
the conditional-typed input poisons generic inference — so `evaluate()`
wraps values in `NoInfer`, and eager schema-leaf validation lives only on
`safeParse` (parse/evaluate get leaf errors via the input check and at
runtime). Scope-aware compile-time validation remains deferred
(scope-blind `type.validate`; aliases need a cast at compile time).

**Phase 4 — Eval typing** (`src/schema/index.ts`). Distributed-union
correlated bindings (the `as any` in the fixture's polymorphic add still
stands until then). ~~Eval-return verification against resultType~~ —
landed early in Phase 1 (`EvalReturn` + `NoInfer`), including
binding-reference and object resultTypes. Dev-mode `.allows()` assertion
on node outputs still pending.

**Phase 5 — Built-in literals & escapes.** `true`/`false`/`null`/`undefined`
leaf nodes with keyword-prefix guards in both engines; escape processing in
the runtime string tokenizer. Port the archive's string-escape and
primitive-literal test corpora (adapted to the v2 API).

**Phase 6 — Rule-as-Type integration (D12/D13).** `parser.compile()`
returning an arktype Type; predicate rules via `narrow` + `ctx.reject({
path })`; ArkErrors surfacing (`flatByPath`); `.in`/`.in.toJsonSchema()`
introspection; Standard Schema conformance test against react-hook-form's
`arktypeResolver`. Independent of Phases 1–5's internals; can develop in
parallel once Phase 1's API lands.

**Phase 7 — Docs, tests, release.** Rewrite affected DESIGN.md sections;
update Starlight guides + playground fixture (playground gains identifier
autocomplete via `schema.props`); port archive benchmark shapes
(`vitest bench`); migration notes; release as the next **0.0.x** (see
D10: never 0.1/0.x, owner directive).

Phases 1–4 land together (they are one breaking change); 5–7 can follow
incrementally.

## Deferred (good ideas, not v2)

- **Function-call operators via `type.fn`** — user-registered functions
  (`max(a, b)`) declared with `type.fn(...params, ':', ret)`, whose
  `.params`/`.returns` the parser introspects to type-check call sites.
  Pairs with the `many()`/argument-list element from the v1 roadmap.
- **Literal result types** — number/string literals parsing as arktype unit
  types (`5` : `"5"`) for constant folding and exact-value comparison.
- **`type.declare` schema conformance** — letting users pin a schema to an
  existing TS interface with exact-conformance errors.
- **JSON Schema import** (`@ark/json-schema`) — bootstrap a stringent
  schema from an existing JSON Schema document.

## Migration (v1 → v2)

| v1 | v2 |
|---|---|
| `rhs(sameAs('left'))` | `rhs('left')` |
| `resultType: fromBinding('left')` | `resultType: 'left'` |
| `associativity: 'left'` + `rhs()` tail | `lhs()` tail |
| `associativity: 'right'` / default + `rhs()` tail | `rhs()` tail (unchanged) |
| `precedence: 'atom'` | highest numeric precedence |
| exact-name constraint match | assignability |
| `eval` casts for polymorphic nodes | correlated bindings, narrow via `b.x` |
| `createParser(nodes, { types })` | `createParser(nodes, { scope })` |

## Risks & open questions

1. **TS recursion depth** — arktype's type-level parser inside our
   type-level parse loop may lower the ~14-term literal-mode ceiling.
   Phase 0 measures; hybrid fallback exists. Runtime paths are unaffected.
2. **Refinements-are-validation-only** (see Semantics) — Phase 0 confirms
   arktype exposes a clean erased projection to compare against.
3. **Bundle/perf cost of arktype at runtime** — mitigated by compiling each
   type definition once per parser; benchmark in Phase 6 against v1 numbers.
4. **Correlated-narrowing ergonomics** — destructuring before narrowing
   severs correlation (TS limitation). Docs must show the `b.x` pattern.
5. **`expr()` must be followed by a `constVal` in the same pattern** (new
   Phase 1 check). `expr()` resets to the full grammar, so in an undelimited
   tail it consumes operators *looser* than the node's own precedence:
   with `sub: [lhs('number'), '-', expr()]` at precedence 2 and `eq` at
   precedence 1, `10 - 5 == 2` parses as `10 - (5 == 2)` instead of
   `(10 - 5) == 2`; `a - b ? x : y` becomes `a - (b ? x : y)`; and
   `10 - 5 - 2` right-nests to `10 - (5 - 2)` = 7 instead of 3. A closing
   const (parens' `)`, ternary's `:`) makes the region delimiter-bounded —
   its extent is decided by tokens, not precedence — which is why `expr()`
   is safe there and only there. Final operand slots must be `lhs()`/`rhs()`.

## Session handoff (2026-07-07)

State for whoever picks this up. Everything below is committed on
`claude/formeddable-stringent-review-suiwqu` in eralmansouri/stringent.
At handoff: `pnpm typecheck`, `pnpm test` (90 tests, 3 files),
`pnpm build`, and `pnpm check:package` are all green. Whole-project
check: ~510k instantiations / ~2.8s.

### Done (this branch, in commit order)

1. `48cc8b5` — Phase 0 spike (`spike/phase0/RESULTS.md`): GO for full
   arktype at compile time; runtime API verification; three API-shape
   corrections (fluent `match.case`, unsatisfiable intersections throw,
   memoize `extends`).
2. `7dd2e99` — Phases 1–2: v2 schema layer + runtime engine. Key files:
   `src/schema/index.ts` (elements, defineNode, eval typing),
   `src/runtime/compile.ts` (validation + precompiled constraints/levels/
   modes), `src/runtime/types.ts` (arktype adapter: scope, caches,
   refinement erasure — the ONLY `.internal` touchpoint),
   `src/runtime/parser.ts` (assignability matching, tail-shape
   associativity, OUTPUT_TYPE symbol), `src/createParser.ts`.
3. `5430184` — `overlapping(binding)` symmetric constraint (fixture `eq`
   uses it); fixed a type-level inference bug (never intersect a found
   element with the PatternSchemaBase union — gate with a conditional).
4. `8c9cbaf`+ — Phase 3: type-level engine rebuilt
   (`src/parse/index.ts`, `src/grammar/index.ts`), full typetest suite
   restored (`src/types.typetest.ts`) with canaries.

### The four load-bearing design rules

- Semantics are data (dual engine; runtime cannot see TS types, type
  engine cannot run functions). Every v2 feature respects this.
- Constraints/resultTypes are arktype defs; a string that names an
  EARLIER binding is a reference to its parsed type; `overlapping(b)` is
  the symmetric form. Matching is assignability (runtime: memoized
  `extends`; type level: `type.infer<A> extends type.infer<B>` over
  literal defs so TS memoizes).
- Associativity from tail shape (lhs tail → left fold, rhs tail → right
  recursion, expr() only in const-delimited slots); highest precedence
  level = leaf.
- Refinements are validation-only: identifier/path/constraint types are
  ERASED for typing (runtime: `eraseRefinements` via internal.transform +
  type.schema round-trip; type level: automatic via type.infer); the full
  schema still validates `values` at evaluate().

### Gotchas that cost real time (do not rediscover)

- arktype `type.validate<T>` or bare `type.infer<T>` as a SIBLING
  parameter of the conditionally-typed input param poisons generic
  inference. MECHANISM (proven by revealing the fixed generics): the
  values ARGUMENT leaks in as an inference candidate for TSchema through
  `type.infer`, and TS unions the candidates — TSchema fixes to e.g.
  `{x: "number"} | {x: 41}`, whose 41-leaf is not a def, so the input
  conditional evaluates to `never`. Only reproduces with a deep deferred
  conditional like Parse<> (a shallow replica infers fine). Hence:
  `evaluate()` wraps values in `NoInfer` (removes the candidate), and
  eager leaf validation lives on `safeParse` only. Don't "fix" by
  intersecting — probed exhaustively.
- Deep-equality test assertions see enumerable symbol props → the parsed
  Type rides on a NON-enumerable symbol (`OUTPUT_TYPE`, set via
  `setOutputType`).
- vitest's `expect(() => createParser(...))` instantiates matchers over
  the Parser type → TS2589 with pathological node types; use block-body
  arrows `expect(() => { createParser(...); })` in throw tests.
- Widened `number` or `never` precedence used to hang the type-level
  digit comparator; `IsValidPrecedence` now guards both (grammar →
  `never`).
- `Token.Number("1..2")` consumes "1" then leaves ".2" — range-like
  operators need whitespace or a different spelling in tests.
- Python heredoc file edits corrupted a UTF-8 file once; prefer the Edit
  tool or io.open(encoding='utf-8').

### Deliberate divergences (documented, not bugs)

- Type-level `outputSchema` carries the def AS WRITTEN; the runtime
  displays arktype's normalized `expression`. Parity = accept/reject +
  inferred TS types, not display strings.
- Passthrough exemption: single-element UNNAMED patterns forbid
  resultType (nothing to declare; `[path()]`'s type is per-parse). Named
  single elements are constructing nodes (converter idiom:
  `[number().as("n")], resultType: "string"`).
- Binding refs must be the WHOLE constraint/resultType string; embedded
  forms (`"then | else"`, `{ value: "acc" }`) deferred until union
  output types.
- Scope-blind compile time: schemas/constraints using createParser
  `scope` aliases need `as never` at compile time (runtime fully
  validates). Threading the scope through type.validate/Parse is an open
  work item.
- Type-level overlap ≈ non-never TS intersection — diverges from arktype
  for object types with disjoint prop types (TS doesn't reduce those to
  never). Corner case, noted in parse/index.ts.

### Next up (in plan order)

- **Phase 4**: correlated distributed-union eval bindings (kills the
  `as any` in fixture `add`; see D5 and the earlier design discussion —
  generate `{l: string, r: string} | {l: number, r: number}` from
  binding links; narrowing must go through the object, destructuring
  severs correlation). Also dev-mode `.allows()` assertion of eval
  outputs against resultType.
- **Phase 5**: built-in true/false/null/undefined literals with
  keyword-prefix guards in BOTH engines + string escape processing.
  Escapes are NOT redundant with parsebox — verified empirically
  (2026-07-07): (a) `Token.String(['"'], '"a\\"b"')` TERMINATES at the
  escaped quote (token `a\`, rest `b" rest`) — wrong tokenization, and
  (b) `"line1\\nline2"` keeps a literal backslash-n — no unescaping.
  Owner asks that Phase 5 tests pin exactly these observable
  differences (escaped-quote termination; `\\n`/`\\xHH`/`\\uHHHH`
  producing real characters in evaluated values). Reference
  implementation + 405-line corpus in the formeddable archive (git
  bundle delivered to the user in chat; org deletion pending).
- **Phase 6**: rule-as-arktype-Type (`parser.compile`) → Standard Schema
  ecosystem (react-hook-form/tRPC/hono), ArkErrors with field paths.
- Toolbox reminder (owner): arktype's `Type.distribute(mapper)` maps
  over union branches — useful for Phase 4 (enumerating a union
  constraint's members for correlated-binding generation / dev
  assertions) and for diagnostics that list every accepted operand form.
- **Phase 7**: DESIGN.md rewrite, Starlight docs + playground update,
  benchmarks (port shapes from archive), migration notes, version 0.1.0.

### Context that lives outside this repo

- The formeddable GitHub org is scheduled for deletion by the user. Its
  full history was delivered as a git bundle in chat
  (formeddable-stringent-backup.bundle); the useful salvage list and the
  v1-vs-archive comparison are summarized early in this plan's history.
- Phase 0 spike scripts are runnable: `spike/phase0/` (self-contained
  package.json).
