# Stringent v2 — API Redesign Plan

Status: proposal. Decisions below came out of a design review comparing this
repo against the archived formeddable/stringent (Jan 2026, arktype-based) and
a discussion of v1's ergonomics. This document plans the work; DESIGN.md
remains the contract for v1 until v2 lands, at which point the relevant
sections get rewritten.

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
| D10 | Version: v2 ships as **0.1.0** (first minor bump; breaking). | Marks the API break under the 0.0.x scheme. |

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

## Phases

**Phase 0 — Spike (go/no-go).** Prove arktype at the type level inside the
literal-parse loop: wire `type.validate`/`type.infer` into one constraint
check and one resultType resolution; run the recursion canaries
(`types.typetest.ts`) and measure how far the TS2589 ceilings move. Decide:
full arktype at compile time vs. hybrid (arktype at leaves, vocabulary
matching mid-parse). Verify exact runtime APIs (subtype check, scope
composition). Exit: written decision + measured canary floors.

**Phase 1 — Schema layer** (`src/schema/index.ts`, `src/createParser.ts`).
New element factories (drop `sameAs`/`fromBinding`), binding-reference
constraints, always-required `resultType` as type expression, scope/collision
validation, tail-shape coherence check, numeric-only precedence with
max-level-is-leaf validation.

**Phase 2 — Runtime engine** (`src/runtime/parser.ts`,
`src/runtime/diagnostics.ts`). Assignability-based `constraintAccepts` with
validator cache; per-parse resultType resolution; associativity-by-shape
dispatch; leaf-level handling; diagnostics say `expected 'number', got
'string | number'` with type expressions.

**Phase 3 — Type engine** (`src/parse/index.ts`). Mirror Phase 2 per the
Phase 0 strategy. Update canaries; document new depth limits in DESIGN.md.

**Phase 4 — Eval typing** (`src/schema/index.ts`,
`src/runtime/evaluate.ts`). Distributed-union bindings type; eval-return
verification against `resultType`; dev-mode `.allows()` assertion on node
outputs. Evaluator mechanics (lazy thunks, `Object.hasOwn` guards)
unchanged.

**Phase 5 — Built-in literals & escapes.** `true`/`false`/`null`/`undefined`
leaf nodes with keyword-prefix guards in both engines; escape processing in
the runtime string tokenizer. Port the archive's string-escape and
primitive-literal test corpora (adapted to the v2 API).

**Phase 6 — Docs, tests, release.** Rewrite affected DESIGN.md sections;
update Starlight guides + playground fixture; port archive benchmark shapes
(`vitest bench`); migration notes; bump to 0.1.0.

Phases 1–4 land together (they are one breaking change); 5 and 6 can follow
incrementally.

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
