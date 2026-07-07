# Phase 0 spike results — GO

Ran 2026-07-06 against `arktype@2.1.x`, `typescript@5.9`. Reproduce with
`pnpm install && node runtime.js` and
`tsc --ignoreConfig --extendedDiagnostics typelevel/<file>.ts --strict --noEmit --skipLibCheck --target es2022 --moduleResolution bundler --module esnext`.

## Verdict

**Full arktype at compile time is viable** — no hybrid vocabulary fallback
needed. All runtime APIs the design depends on work as planned, with three
API-shape corrections (below).

## Type-level cost (the go/no-go question)

| file | shape | instantiations | check time |
|---|---|---|---|
| `control.ts` | 500-deep recursive loop, no arktype | 136,436 | 0.27s |
| `infer-memoized.ts` | same loop + 3 arktype assignability checks per level (finite def set) | 139,414 | 0.33s |
| `infer-distinct.ts` | 100 *distinct* refined defs, each inferred + checked | 119,298 | 0.36s |
| `infer-schema.ts` | nested object schema infer + validate + keyword unions | 3,057 | 0.12s |

Key finding: with a **finite grammar def set** (the real-world case — defs
come from node constraints/resultTypes), TypeScript memoizes each distinct
`type.infer<def> extends type.infer<def2>` check, so the marginal cost per
parse step is ~zero (+3k instantiations total for 1,500 checks in a
500-deep recursion; no TS2589 even at depth 500). The one-time cost is
~1.2k instantiations per distinct def — a 50-node grammar pays roughly one
percent of a typical instantiation budget, once.

Implication for the type engine: keep constraint checks expressed over the
def strings themselves (`Assignable<A, B>` with literal def params) so TS
memoization applies; do not thread parse-state into the check's type
arguments.

## Runtime API verification (all PASS — see `runtime.js`)

- `extends`/`ifExtends`/`overlaps`/`equals` behave per design (D15),
  including refinement direction (`number > 0 ⊆ number`, not vice versa).
- `Type.get('values','address','zip')`, `keyof()`, scope spread
  composition, keyword constraints (`string.email`), `onUndeclaredKey:
  'reject'` all work (D11).
- Rule-as-Type: `narrow` + `ctx.reject({path})` attributes errors to the
  right field (`flatProblemsByPath` → `{confirmPassword: [...]}`); morph
  pipelines compose; `.in.toJsonSchema()` emits a correct document (D12/D13).
- Benchmarks: `match` dispatch ~57–75ns/op, `allows()` ~16ns/op, memoized
  `extends` ~160ns/op, Type compilation ~0.06–0.3ms once per distinct def.

## API-shape corrections discovered

1. **`match` object cases need the fluent API.** Object literals are not
   string-embeddable as case-record keys (`"{ acc: string }"` →
   `'{' is unresolvable`). Use `match.case({acc: "string", append:
   "string"}, fn).case(...).default("assert")`. D14's sketch updated.
2. **Unsatisfiable intersections throw at Type construction** ("Intersection
   of number and string results in an unsatisfiable type") instead of
   reducing to a `never` Type. Better for the "rule can never pass" lint,
   but constraint compilation in `createParser` must try/catch and re-raise
   as a grammar construction error.
3. **Raw `extends()` is ~0.6–1.2µs/op** (not cached pairwise internally).
   Fine at parse time, but the backtracking hot path should memoize
   verdicts per (candidate, constraint) expression pair — ~160ns memoized.
