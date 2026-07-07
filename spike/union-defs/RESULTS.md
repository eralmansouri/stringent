# Embedded binding references spike — scopes win, restriction lifted

Context: v2 initially restricted binding references to WHOLE constraint /
resultType strings (`"left"` but not `"left | null"`), citing type-level
cost. The owner challenged this (2026-07-07): arktype scopes resolve
embedded aliases trivially at runtime, so show the blowup or ship the
feature. Measured with the repo's tsc 5.9 / arktype 2.2 via
`tsc --extendedDiagnostics --strict --noEmit --skipLibCheck --target
es2022 --moduleResolution bundler --module esnext <file>.ts`.

## Verdict: the restriction was unjustified — implement via scopes

| file | design | depth | instantiations | check time |
|---|---|---|---|---|
| `control.ts` | today: fixed literal defs per level | 500 | 132,770 | 0.39s |
| `scoped.ts` | `type.infer<"left \| null", { left: Acc }>` per level | 500 | **137,977** | 0.36s |
| `synth-30.ts` | synthesize def strings `` `(${Acc}) \| null` `` per level | 30 | 333,557 + **TS2589** | 0.54s |

- **Scoped inference costs ~10 instantiations per level over control** —
  effectively free. TS union normalization gives a fixed point
  (`number | null | null` ≡ `number | null`), so the set of distinct
  (def, scope) pairs stays finite and memoization keeps working.
- **Textual substitution is the design that blows up** (unbounded distinct
  def strings, each re-parsed by arktype's type-level parser) — it dies
  at the depth of the existing left-chain canary. The original concern
  was real but attached to the wrong mechanism.

## Semantics (`semantics.ts`, all verified)

- `type.infer<def, $>`'s second parameter is a scope of already-INFERRED
  alias types: `type.infer<"left | null", { left: number }>` is exactly
  `number | null`; works inside `"left[]"` and object defs
  (`{ value: "left" }`). String-embedded object syntax stays unsupported
  (Phase 0 finding).
- Runtime twin: `scope({ left: someType }).type("left | null")` — alias
  values may be Type INSTANCES. Uncached ~1.4ms/op (scope construction),
  memoized by (def, alias expressions) ~160ns/op — same cache discipline
  as `extends()`.

## Design consequences

- Runtime: `TypeEnv.compileDefIn(def, aliases)` — extend the parser's
  scope with the parsed sibling Types, cache by def + alias expressions.
- Type level: resolve template defs with `type.infer<def, scope>` built
  from the parsed siblings; a template node's outputSchema becomes a
  resolved-type CARRIER (`{ "~resolved": T }`) since a TS type cannot be
  turned back into a def string — display parity already diverges by
  design (accept/reject + inferred types are the parity contract).
- Plain defs keep the un-scoped path (`type.infer<def>` memoizes
  globally); the scoped path engages only when plain inference yields
  `never` (unresolvable → contains references).
