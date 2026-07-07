# HANDOFF — v2 rework directed by PR #6 review (2026-07-07)

For a FRESH session (or delegated agents). The owner reviewed PR #6
(https://github.com/eralmansouri/stringent/pull/6, branch
`claude/v2-plan-review-e13a11`) and rejected substantial parts of the v2
implementation. This file converts every review comment into a work item
with acceptance criteria. Read this FIRST, then V2-PLAN.md (history) and
DESIGN.md (current contract — several sections will be invalidated by
this rework and must be updated alongside the code).

## Current verified state

- Branch `claude/v2-plan-review-e13a11`, PR #6 (base `main`), CI green
  (Node 20/22), `pnpm typecheck` + `pnpm test` (147 tests, 5 files) +
  `pnpm build` + `pnpm check:package` green. 13 unresolved review
  threads, all from the owner — listed below with anchors.
- The docs site (docs/) compiles snippets via twoslash on build; DESIGN.md
  claims are pinned by src/design-claims.test.ts / .typetest.ts. Keep both
  invariants when reworking.

## Owner's standing directives (violations caused this rework)

1. **Type safety is the product.** Anything a user can misspell must fail
   at compile time where technically possible, else at construction —
   `operand("nmbr")` compiling is a product failure, not a nit.
2. **No invented API surface.** Do not add options/props the owner didn't
   ask for (`dev`, `assertResults`, `lazy` are the offenses on record).
   When an option seems needed, ask first.
3. **No speculative type machinery.** A few hundred lines of clever types
   must pay for themselves in user-visible value or not exist.
4. **Demonstrate everything.** Any claim in comments/docs ("X breaks Y")
   needs an inline snippet or a reference to a pinned test
   (design-claims files). No hand-waving — repeatedly requested.
5. Versioning stays 0.0.x (D10). Factories are `operand`/`rest` (D16).

## Work items (dependency order)

### R1 — Compile-time validation of constraints/resultTypes  [BIG, core]
Review: schema/index.ts:119 «Again where is the validation?
operand("asfsdafsdaf")… What is the purpose of the project if not to be
type-safe?» and :98 «The whole project depends on arktype, why are you
randomly doing these checks here?» (anchored near the `isOverlapsRef`
runtime guard / ConstraintSpec, i.e. hand-rolled checks where arktype
should be doing the work).
- Goal: a typo'd def in `operand(...)`/`rest(...)`/`expr(...)`/
  `resultType` errors AT THE defineNode CALL SITE via arktype
  `type.validate`, while binding references ("left", "left | null")
  remain legal. Validation belongs at `defineNode` (the pattern tuple is
  in scope there, so earlier binding names are statically known).
- Sketch: validate each expr constraint as
  `ValidConstraint<C, EarlierBindingNames>` = C extends earlier-name ?
  C : C references earlier names ? scoped validate (type.validate<C, {name: unknown}…> —
  VERIFY arktype's validate accepts a scope param like infer does) :
  type.validate<C>. Same for resultType with all binding names.
- Hazards (measured, do not rediscover): the metastable-inference finding —
  `type.validate` on a parameter whose SIBLING is a deferred conditional
  is order-sensitive (pinned in design-claims.typetest.ts §inference-
  poisoning). defineNode has NO conditional input param, so validate
  should be safe there — but PROVE it with the bisect technique
  (declaration-order permutations) before trusting it.
- Scope aliases (`createParser scope`) are unknown at defineNode →
  decide with owner: (a) defer alias-using constraints to construction
  (runtime) with a documented cast, or (b) a `defineNodes(scope, …)`
  variant carrying the alias types. Owner already flagged the existing
  `as never` casts as "Not good at all" (createParser.test.ts:126) — see
  R8; prefer a design that kills the casts.
- Acceptance: `operand("nmbr")` in a defineNode pattern = compile error
  at the leaf; `rest("left")`/`rest("left | null")` still compile;
  typecheck stays under ~1M instantiations; canaries in
  types.typetest.ts still pass.

### R2 — Delete the correlated-bindings type machinery  [BIG deletion]
Review: schema/index.ts:528 «Complete mess that I won't even bother to
even look at», :744 «I don't like any of the above few hundred lines of
code», :543 and :622 «always demonstrate the problem» (comment-block
claims without inline demos).
- Remove `CorrelationRoots`/`RootOf`/`ReferencersOf`/`SplitDefUnion`/
  `HasInvalidMember`/`RootBranches`/`CorrelatedGroups`/`GroupBranch`/
  `CorrelatedNames` and revert `InferEvaluatedBindings` to the flat
  per-binding mapping (git: the pre-34af413 shape, plus keyword-literal
  additions).
- The fixture's match-based `add` still works on the FLAT type
  (match narrows per case; verified reasoning — re-verify): keep match
  as the polymorphic idiom, drop the distributed-union types.
- Update: types.typetest.ts (_b1…_b6 assertions), DESIGN.md "Eval
  typing" section, V2-PLAN.md (mark D5 REVERSED by owner review),
  design-claims files (drop straddle/def-granularity demos or re-scope
  them to match-only).
- EvalReturn (eval-return-vs-resultType checking) STAYS — it predates
  Phase 4 and wasn't objected to.

### R3 — `lazy` always on; delete the prop  [breaking, mechanical]
Review: schema/index.ts:434 «I would prefer that lazy is always true and
avoid having unnecessary props like this.»
- eval ALWAYS receives memoized thunks; remove `lazy` from NodeSchema,
  defineNode generics (TLazy), evaluator branching, docs, fixture
  (`ternary` loses `lazy: true`; every eager eval becomes
  `({left, right}) => left() - right()` style).
- Update DESIGN.md evaluation model + laziness bullet; V2-PLAN note.

### R4 — Remove dev/assertResults option surface  [deletion]
Review: runtime/evaluate.ts:165 «I don't like any of this, and also
creating random options with nonsensical props that you invented is not
good. Never again please.»
- Delete `EvaluateOptions`, `assertResults`, `createParser`'s `dev`
  option, the NODE_ENV sniffing, and the output-vs-resultType runtime
  assertion block. Remove the corresponding tests/claims/docs (DESIGN
  "dev-mode result assertions", D4's runtime-half note in plan → mark
  reversed).
- If output assertions ever return, they return as an owner-approved
  design, not an option.

### R5 — Type eval's `runtimeValues` parameter  [design + answer]
Review: schema/index.ts:435 «Why are the runtime values not typed or
inferred in any way?»
- Honest constraint: node definitions are schema-agnostic — the values
  object's shape is only known per evaluate() call. Options to bring the
  owner: (a) generic `defineNode<TValues>` opt-in; (b) type it as the
  identifier/path types actually READ by the pattern (only `path()`/
  `ident()` elements produce reads — often not statically known); (c)
  leave `Record<string, unknown>` but document why, in-code, with a
  reference. Ask the owner which; do not invent.

### R6 — Keyword literals vs ConstSchema  [answer, maybe simplify]
Review: schema/index.ts:465 «How are these different than just re-using
or effectively aliasing ConstSchema<'"true" | "false"'>?»
- Real differences (demonstrable): constVal matches raw text with NO
  word boundary (`constVal("null")` matches the `null` in `nullable`),
  const nodes carry matched TEXT as outputSchema/value (not typed
  values), keyword nodes yield real true/false/null/undefined values
  with proper arktype types. Options: keep the three schemas but reply
  with the demo, or unify into one `keyword("true" | "false" | "null" |
  "undefined")` element (less API surface — likely preferred given
  directive 2). Ask or propose in the PR thread with the demo.

### R7 — safeParse must not throw (schema errors)  [decision + small]
Review: createParser.test.ts:84 «safeParse.... throws?» — anchored on
the test pinning that invalid schemas THROW from safeParse.
- Current doctrine: input errors → structured result; schema errors →
  throw (programmer error). Owner questions it. Likely fix: safeParse
  returns `{ success: false, error }` with a distinct SCHEMA_ERROR code
  instead of throwing; parse/evaluate/compile keep throwing (they throw
  for input too). Confirm with owner, then update diagnostics, tests,
  DESIGN error model.

### R8 — Kill the scope-blind `as never` casts  [hard, research]
Review: createParser.test.ts:126 «Not good at all» — anchored on the
documented "scope-blind compile time" cast workaround.
- The deferred work item "thread createParser scope aliases through
  type.validate/Parse" is now owner-priority. Approach: `createParser`
  already knows the alias literal types; `SchemaShape` positions and
  literal-mode ident resolution need the scope passed down (Context
  carries data; add scope aliases to Context and resolve defs with
  `type.infer<def, aliases>` — the D17 scoped-infer machinery already
  exists at the type level and is the likely vehicle). Spike first;
  measure instantiations; the metastability hazard applies to validate
  positions (see R1).

### R9 — Inline-demonstrate every comment claim  [sweep]
Review: schema/index.ts:543, :622 (pattern: «Alwayssss demonstrate the
problem»). After R2 removes most offenders, sweep remaining code
comments for undemonstrated claims; each gets a snippet or a
`design-claims` reference. The DESIGN.md no-hand-waving rule already
exists — extend it to code comments.

### R10 — Associativity history writeup  [docs, small]
Review: __fixtures__/grammar.ts:144 «I want a clear explanation of why
assoc property was present, why lhs/rhs were added, demonstrate the
issues with that design and why this change fixed it.»
- Material exists: DESIGN.md "Associativity by tail shape" + the
  3-vs-7 demo in design-claims.test.ts, V2-PLAN D6/D16 rationale (v1's
  associativity label LIED — v1 runtime reinterpreted a left level's
  rhs() tail at the next level regardless of the property). Write it as
  one coherent short section (docs/ explanation page or DESIGN box),
  link it from the fixture comment, and reply on the thread.

## Answering the PR threads

Reply on each thread only when its work item lands (or when the answer
IS the deliverable: R5, R6, R7 include reply drafts above). Be frugal;
the diff is the record.

## Verification bar for every item

`pnpm typecheck && pnpm test && pnpm build && pnpm check:package`, docs
build if docs touched, canaries intact, and design-claims files updated
in the same commit as the behavior they pin. Both engines change
together, always (dual-engine law).

## Session-history context worth keeping (do not rediscover)

- Everything in V2-PLAN.md "Gotchas that cost real time", especially:
  the inference metastability bisect, prose comments containing the
  ts-expect-error string ACTIVATE it, arktype matchers must be wrapped
  when used as eval (second arg = traversal context), distinct morphs
  share `.expression` (cache keys need instance ids — fixed, pinned).
- spike/phase0 and spike/union-defs are runnable and justify the
  arktype-at-compile-time and scoped-inference designs with numbers.
- The Fable review report (2026-07-07) found the engines parity-clean
  under adversarial probing; its three findings are fixed and pinned
  under "review findings" in design-claims.test.ts.
