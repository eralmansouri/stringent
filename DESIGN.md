# Stringent — Design (v2)

This document describes the architecture and the reasoning behind it. It is
the contract the codebase is held to; if behavior and this document disagree,
one of them is a bug. (The v1→v2 redesign is chronicled in V2-PLAN.md; this
document describes the result.)

**No hand-waving rule:** every demonstrable claim, limit, and odd behavior
below comes with a snippet, and each snippet is pinned by an executable
twin — `src/design-claims.test.ts` (runtime, vitest) and
`src/design-claims.typetest.ts` (compile time, tsc). If a snippet here and
those files disagree, the files win and this document is wrong.

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

1. **Compile time, at the definition site.** Patterns are authored through
   a fluent builder whose chained calls validate every def the user
   writes via arktype's `validate`, with the bindings accumulated so far
   as scope aliases: `operand("nmbr")` errors AT that call with arktype's
   own message; `rest("left")` and `rest("left | null")` compile because
   `left` is in scope; refinements on references, forward/position-0
   references, const-binding references, duplicate/reserved/type-shadowing
   binding names, and typo'd result defs all error where they are written
   (pinned in design-claims.typetest.ts "pattern builder"). `.result()`
   and `.eval()` are chain methods — NOT config siblings — because a
   pattern-dependent sibling property makes tuple inference order-
   sensitive (demonstrated in the same file). Schema leaves are checked
   via `type.validate` on `safeParse`/`compile`; `parse`/`evaluate`
   cannot carry that validator, for two demonstrated reasons
   (design-claims.typetest.ts): (a) a bare `type.infer<TSchema>` values
   parameter DETERMINISTICALLY poisons inference — which is why
   `evaluate`'s values are `NoInfer`-wrapped; and (b) with their
   deferred-conditional input parameter, a `validate`-wrapped schema is
   METASTABLE: the identical call typechecks or collapses to `never`
   depending on declaration order elsewhere in the file. Bad leaves
   there surface through the input check and at runtime.
2. **Construction time.** `createParser` re-checks everything the builder
   checks (for plain-JS callers) plus the cross-element and cross-node
   rules types cannot see, and throws with a precise message.
3. **Runtime.** Schemas are compiled in the parser's scope, covering
   dynamically-built schemas; `safeParse` returns a structured
   `INVALID_SCHEMA` error instead of throwing.

```ts
// layer 1 — the typo is a COMPILE error at the chained call:
defineNode({ name: "bad", precedence: 1, pattern: (p) => p.operand("nmbr") });
//                                                                 ~~~~~~
// ✗ Argument of type '"nmbr"' is not assignable to "'nmbr' is unresolvable"

// the same typo in a schema leaf is a COMPILE error on safeParse:
parser.safeParse("1+1", { x: "numbr" });
//                            ~~~~~~~ ✗ Type '"numbr"' is not assignable
//                                      to '"'numbr' is unresolvable"'
// …but NOT on evaluate (the inference-poisoning limit) — layer 3 catches it:
parser.evaluate("1+1" as never, { x: "numbr" } as never, { x: 1 } as never);
// ✗ StringentParseError: "invalid schema — 'numbr' is unresolvable…"
```

`"unknown"` is the type of unresolved identifiers/paths. Constrained slots
reject it, which is how "identifier not in schema" surfaces as a type
mismatch naming the offender:

```ts
parser.safeParse("1 + zz", {});
// ✗ TYPE_MISMATCH: … 'zz' is not in the schema … expected number | string

// position nuance: an unknown LEADING a left-fold level makes the fold
// never start, so the prefix parses alone and the leftover input wins:
parser.safeParse("zz + 1", {}); // ✗ UNEXPECTED_INPUT (not TYPE_MISMATCH)
```

At runtime, UNCONSTRAINED slots accept unknown operands — `zz == yy`
parses (eq's left slot is `operand()`, and `overlapping()` against an
unknown is permissive) and fails only at evaluation with
`'zz' is not defined`. Literal mode is stricter: the type engine rejects
`"unknown"` candidates in every constrained slot, `overlapping()`
included, so `parse("zz == yy", {})` is a compile error — a conservative
engine divergence (see Dual-engine parity). Grammars that want unresolved
identifiers rejected structurally at runtime too should constrain their
slots.

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
`.result("left | null")`, `.result({ value: "left" })`. Such
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

```ts
// erased for typing: `age` is just a number, so this parses (both engines) —
// refinement-level expression typing isn't even well-defined: what would
// the refinement of `age + 1` be?
parser.safeParse("age + 1", { age: "number > 0" }); // ✓ parses

// enforced on values: the SAME schema rejects a bad values object
parser.evaluate("age + 1", { age: "number > 0" }, { age: 41 }); // 42
parser.evaluate("age + 1", { age: "number > 0" }, { age: -5 });
// ✗ throws: values do not match the schema: age must be positive (was -5)
```

### Result types (what a node produces)

| Form | Meaning |
|---|---|
| `.result("boolean")` | static — the node mints a type (any arktype def, string or object) |
| `.result("then")` | derived — the node's type is whatever the operand bound as `then` parsed as |
| omitted | only for passthrough patterns (single unnamed non-const element), which forward a child and construct nothing — declaring a type there would be a lie, so it is forbidden |

Derived `outputSchema` is computed per-parse: `evaluate("'a'+'b'", …)` is
typed `string` while `evaluate("1+2", …)` is typed `number`. The AST's
`outputSchema` stays serializable data; the compiled arktype `Type` rides
alongside on a non-enumerable symbol (`OUTPUT_TYPE`), invisible to JSON and
deep-equality assertions.

### Eval typing: flat bindings

`eval` receives typed bindings derived from the pattern — a FLAT
per-binding map. A binding-reference constraint resolves (transitively) to
the referenced operand's constraint type; everything else is the element's
own type:

```ts
pattern: (p) => p.operand("number | string").as("left").constVal("+").operand("left").as("right")
// eval receives: { left: string | number; right: string | number } (as thunks)
```

The flat type is honest about what the parser guarantees **per binding**;
it does not claim cross-binding correlation. For polymorphic evals, the
idiomatic style is arktype's `match` — one case per accepted combination,
`.default("assert")` rejecting the rest at runtime (pinned in
design-claims.test.ts "eval typing"):

```ts
const addImpl = match
  .in<InferEvaluatedBindings<typeof addPattern>>()
  .case({ left: "number", right: "number" }, (b) => b.left + b.right)
  .case({ left: "string", right: "string" }, (b) => b.left + b.right)
  .default("assert");

// bindings are THUNKS — evaluate them, then match (in the chain):
.result("left").eval((b) => addImpl({ left: b.left(), right: b.right() }))
```

The runtime backstop matters because values may straddle the accepted
combinations: a union-typed schema identifier satisfies both slots of
`add`, so `.default("assert")` turns the mixed case into a runtime error
(pinned in design-claims.test.ts):

```ts
// x parses AS "string | number", satisfying both slots of add —
parser.evaluate("x + 1", { x: "string | number" }, { x: 1 });    // 2
parser.evaluate("x + 1", { x: "string | number" }, { x: "hi" });
// ✗ throws (match .default("assert")) instead of silently making "hi1"
```

`eval`'s **return type** is verified against the declared `resultType` at
the `defineNode` call site — binding references, object defs, and defs
embedding references (resolved in a scope of the pattern's bindings) all
included.

## Parsing model

- **Grammar** = precedence levels sorted ascending (lowest binds loosest,
  parsed first, outermost in the tree). Precedence is a non-negative safe
  integer; the **highest level present is the leaf level**, whose patterns
  must start with a consuming element. Duplicate precedences share a level;
  nodes within a level are tried in definition order with backtracking —
  keyword-const nodes must precede identifier/path nodes, or `true`
  parses as an identifier (pinned in design-claims.test.ts):

  ```ts
  createParser([trueLit, variable]).safeParse("true", {}).ast;
  // { node: "true", outputSchema: "boolean" }                   ✓
  createParser([variable, trueLit]).safeParse("true", {}).ast;
  // { node: "path", path: ["true"], outputSchema: "unknown" }   ✗ trap
  ```
- **Roles** name the grammar level a slot parses at: `operand()` parses at
  the next tighter level (prevents left recursion); `rest()` parses at the
  current level; `expr()` resets to the full grammar. `expr()` must be
  followed by a `constVal` in the same pattern — it is only sound in
  delimiter-bounded regions (parens' `)`, ternary's `:`); an undelimited
  `expr()` tail would swallow looser operators (`10 - 5 == 2` would parse
  as `10 - (5 == 2)`), so it refuses to build:

  ```ts
  defineNode({ name: "bad", precedence: 1, pattern: (p) =>
    p.operand("number").as("a").constVal("-").expr().as("b").result("number") });
  createParser([num, bad]);
  // ✗ "node 'bad' has an expr() element with no constVal after it — …"
  ```
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

  ```ts
  // same tokens, different tail role, different math:
  // sub with an operand() tail → left fold → (10-5)-2
  parser.evaluate("10-5-2", {}, {}); // 3
  // an otherwise-identical sub with a rest() tail → right recursion
  rightParser.evaluate("10-5-2", {}, {}); // 7 — 10-(5-2)
  // and mixing both shapes in one level refuses to build:
  createParser([leftTailSub, rightTailAdd]); // ✗ "precedence 1 mixes tail shapes"
  ```
- **Pattern elements**: `number()`, `string(quotes)`, `ident()`, `path()`,
  `constVal(text)`. There is no keyword element — keyword literals are
  ordinary const-pattern nodes
  (`pattern: (p) => p.constVal("null").result("null").eval(() => null)`),
  which works because of the **word-boundary rule**: an identifier-like
  const value matches only as a whole identifier (`nullable` is one
  identifier, never `null` + `able`; `andy` never matches `constVal("and")`
  — pinned in design-claims.test.ts), while non-identifier values (`"+"`,
  `"=="`) match as raw text. String literals process escapes (`\n \t \r
  \\ \" \' \` \0 \b \f \v \xHH \uHHHH`); unknown escapes resolve to the
  escaped character, JS-style.
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
values, identifiers/paths look up the values object, and the node's
`eval(bindings)` runs with each named binding delivered as a **memoized
thunk**. The parsed `outputSchema` types the result, so evaluation is typed
end-to-end for literal inputs. `evaluate()` validates the values object
against the full schema (refinements included) before evaluating.

- **Evaluation is uniformly lazy**: `eval` always receives memoized thunks
  (`() => value`). Call a binding to evaluate it — untaken branches are
  never evaluated, so ternary/`&&`/`||` short-circuit with no opt-in, and
  memoization means a side-effecting child evaluates at most once no
  matter how many times its thunk is called (pinned in evaluate.test.ts
  "uniform laziness"):

  ```ts
  .eval(({ cond, then, else: alt }) => (cond() ? then() : alt()))
  // "1==1 ? 2 : x" with x undefined evaluates to 2 — the else branch
  // never runs (pinned in evaluate.test.ts)
  ```
- **Security posture**: expressions are untrusted input. All identifier and
  path lookups — in the evaluator *and* in parse-time schema resolution —
  use own-property checks (`Object.hasOwn`). `constructor`, `__proto__`,
  `x.constructor` etc. resolve to "not defined", never to prototype
  internals. User node names may not shadow the built-in node kinds
  (reserved-name validation), so `eval` dispatch cannot be hijacked.

  ```ts
  parser.evaluateAst({ node: "identifier", name: "constructor", … }, {});
  // ✗ EvaluationError: 'constructor' is not defined
  parser.evaluateAst({ node: "path", path: ["x", "__proto__"], … }, { x: {} });
  // ✗ EvaluationError: 'x.__proto__' is not defined
  ```

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

```ts
const rule = parser.compile("values.password == values.confirmPassword",
  formSchema, { path: ["values", "confirmPassword"], message: "passwords to match" });

const out = rule({ x: 0, values: { password: "hunter2", confirmPassword: "oops" } });
out instanceof type.errors;              // true
Object.keys(out.flatByPath);             // ["values.confirmPassword"]
out.summary.includes("hunter2");         // false — secrets never leak

rule.in.toJsonSchema();                  // ✗ throws ToJsonSchemaError (predicate node)
rule.in.toJsonSchema({ fallback: { predicate: (ctx) => ctx.base } }); // ✓
```

## Error model

Two error domains, each using the representation built for it:

- **Parse-time** failures are stringent's positioned diagnostics.
  `safeParse` NEVER throws; it returns `{ success: false, error }` with
  `code` (`PARSE_ERROR` — no interpretation matched; `TYPE_MISMATCH` —
  parsed but a constraint rejected it; `UNEXPECTED_INPUT` — a prefix parsed,
  trailing input remains; `INVALID_SCHEMA` — the schema argument's defs do
  not compile, a programmer error normally caught at compile time, with
  `position` fixed at 0), `position` (0-based), `expected`, `found`.
  `parse()`/`evaluate()`/`compile()` throw `StringentParseError` (same
  fields, all four codes). Pinned in createParser.test.ts "schemas and
  scope".
- **Data-time** failures are **ArkErrors**: schema validation in
  `evaluate()` and everything produced by compiled rules (serializable,
  `flatByPath` for per-field form state, field-path attribution via
  `ctx.reject({ path })`). The evaluator itself throws `EvaluationError`
  for undefined identifiers/paths and missing `eval`.

Ranking: the parser records the **furthest** token failure plus the
furthest-reaching constraint mismatch *span*. A mismatch wins when its span
reaches both the stuck position and the furthest token failure — otherwise
it is backtracking noise (e.g. a ternary probing whether `1` is boolean) and
the token story wins.

Known ranking weakness (tracked): unclosed delimiters (`"(1"`, `"(1))"`)
can report a speculative constraint mismatch (a low-precedence rule probing
its condition) instead of the missing/stray delimiter, because the mismatch
span ties the delimiter failure at end-of-input:

```ts
parser.safeParse("(1", {}).error;
// TYPE_MISMATCH @1: "Expected a boolean expression at position 1, got number"
// — the ternary probing `1` as its condition, NOT the missing ")"
```

A related shape (found writing the claims files): an unknown identifier
LEADING a left-fold level reports `UNEXPECTED_INPUT` on the leftover text
(`"zz + 1"`) rather than the constraint mismatch, because the fold never
starts and the prefix `zz` parses alone. A proper fix for both needs a
credibility signal on mismatches (e.g. only prefer one whose pattern also
matched its following token); until then delimiter errors may read as type
errors and leading-operand mismatches as trailing-input errors.

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

Deliberate engine divergences — conservative (the type level rejects
things the runtime accepts) in every case but the last, which is the one
known exception in the other direction:

- Unknown operands in reference/`overlapping()` slots: the runtime treats
  an unresolved referenced operand as unconstrained (`zz == yy` parses,
  failing at evaluation), while literal mode rejects `"unknown"`
  candidates in every constrained slot — `parse("zz == yy", {})` is a
  compile error.

- `\xHH`/`\uHHHH` string escapes decode at runtime only; hex cannot be
  decoded at the type level, so literal-mode parsing rejects them (use
  `safeParse`):

  ```ts
  parser.parse('"\\x41"', {});     // ✗ compile error — hex is runtime-only
  parser.safeParse('"\\x41"', {}); // ✓ evaluates to "A"
  parser.parse('"a\\"b"', {});     // ✓ simple escapes work in BOTH engines
  ```
- Definitions using `createParser`'s `scope` aliases resolve at runtime
  only; compile-time validation and literal-mode parsing use arktype's
  default scope, so scope-alias grammars need `as never` at compile time
  (threading the scope through `type.validate` is an open work item):

  ```ts
  const p = createParser(nodes, { scope: { Money: "number" } });
  p.safeParse("x", { x: "Money" });          // ✗ compile error (default scope)
  p.safeParse("x", { x: "Money" } as never); // ✓ runtime resolves Money fully
  ```
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

  ```ts
  declare const wide: Record<string, "number">;
  parser.parse("nope + 1", wide); // compiles — every identifier "resolves"
  // ✗ runtime: StringentParseError ('nope' is not in the schema)
  ```
- **The non-conservative corner**: type-level overlap is approximated as
  a non-never TS intersection, which diverges from arktype for object
  types with disjoint property types — TS does not reduce
  `{ v: string } & { v: number }` to `never`, arktype knows no value
  inhabits both. So this *compiles and then throws*:

  ```ts
  const objSchema = { a: { v: "string" }, b: { v: "number" } } as const;
  parser.parse("a == b", objSchema); // compiles (TS: {v: never} ≠ never)
  // ✗ runtime: TYPE_MISMATCH → StringentParseError (arktype: disjoint)
  ```

  Fixing it needs a deep never-leaf scan at the type level; tracked in
  `src/parse/index.ts`.

## Limits & non-goals (current)

- Union-typed outputs exist only where DECLARED (template resultTypes like
  `"left | null"`); a ternary's disagreeing branches still don't
  auto-synthesize `"number | string"` — they must agree via a reference.
- Eval-binding typing for template CONSTRAINTS is conservative: a binding
  constrained by a def embedding a reference (`rest("l | null")`) types as
  `unknown` in eval's parameter. Eval-RETURN checking is not: resultType
  defs embedding references resolve in a scope of the pattern's bindings
  (see "Eval typing: flat bindings").
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
