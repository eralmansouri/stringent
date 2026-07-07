/**
 * Arktype adapter (v2 type system)
 *
 * Central, cached access to the arktype APIs the engines depend on:
 * compiling defs in the parser's scope, assignability checks, and schema
 * type resolution. Per the Phase 0 spike:
 * - Types JIT-compile on instantiation → compile each distinct def ONCE
 * - extends() is not pair-cached internally (~0.6µs raw) → memoize
 *   verdicts per (candidate, constraint) expression pair (~160ns)
 * - unsatisfiable intersections THROW at construction → callers surface
 *   that as a grammar construction error
 */

import { scope, type Type, type } from "arktype";

/** A user-provided scope: alias names → arktype defs */
export type ScopeAliases = Record<string, unknown>;

/**
 * The compiled type environment for one parser: a scope (built-in arktype
 * keywords + user aliases) plus caches for def compilation and
 * assignability verdicts.
 */
export interface TypeEnv {
  /** Compile a def in this parser's scope (cached for string defs). */
  compileDef(def: unknown): Type;
  /**
   * Compile a def in this parser's scope EXTENDED with per-parse binding
   * aliases (`compileDefIn("left | null", { left: <parsed Type> })`).
   * Scope construction is expensive (~1.4ms); results are memoized by
   * def + alias expressions (~160ns; see spike/union-defs).
   */
  compileDefIn(def: unknown, aliases: Record<string, Type>): Type;
  /** Is `candidate` assignable to `constraint`? Memoized. */
  isAssignable(candidate: Type, constraint: Type): boolean;
  /** Could any value inhabit both types? Symmetric; memoized. */
  isOverlapping(a: Type, b: Type): boolean;
  /** True when the string resolves as a def in this scope. */
  resolves(def: string): boolean;
  /** True when the def resolves once the given alias names are in scope
   *  (construction-time validation of embedded binding references). */
  resolvesWith(def: unknown, aliasNames: readonly string[]): boolean;
}

export function createTypeEnv(userAliases: ScopeAliases | undefined): TypeEnv {
  const baseAliases = userAliases ?? {};
  const $ = scope(baseAliases as never);
  const stringDefCache = new Map<string, Type>();
  const objectDefCache = new WeakMap<object, Type>();
  const scopedDefCache = new Map<string, Type>();
  const assignabilityCache = new Map<string, boolean>();

  // DISTINCT morphs share an `.expression` ("(In: string) => Out<unknown>"),
  // so expression-keyed caches would collide for them (review finding F1).
  // Morph-containing types get a per-instance id appended to their keys.
  const morphIds = new WeakMap<Type, number>();
  let nextMorphId = 1;
  const keyOf = (t: Type): string => {
    const expression = t.expression;
    if (!expression.includes("=>")) return expression;
    let id = morphIds.get(t);
    if (id === undefined) {
      id = nextMorphId++;
      morphIds.set(t, id);
    }
    return expression + "#" + id;
  };

  const compileDef = (def: unknown): Type => {
    if (typeof def === "string") {
      let compiled = stringDefCache.get(def);
      if (compiled === undefined) {
        compiled = $.type(def as never) as Type;
        stringDefCache.set(def, compiled);
      }
      return compiled;
    }
    if (def !== null && typeof def === "object") {
      let compiled = objectDefCache.get(def);
      if (compiled === undefined) {
        compiled = $.type(def as never) as Type;
        objectDefCache.set(def, compiled);
      }
      return compiled;
    }
    throw new Error(
      `stringent: a type definition must be a string or an object, got ${typeof def}`
    );
  };

  const compileDefIn = (
    def: unknown,
    aliases: Record<string, Type>
  ): Type => {
    // cache key: def identity (strings are their own identity; object defs
    // come from node schemas, one per node, so JSON is fine) + each alias's
    // normalized expression, NUL-separated (expressions contain spaces)
    let key = typeof def === "string" ? def : JSON.stringify(def);
    for (const name of Object.keys(aliases).sort()) {
      key += "\0" + name + "\0" + keyOf(aliases[name]);
    }
    let compiled = scopedDefCache.get(key);
    if (compiled === undefined) {
      compiled = scope({ ...baseAliases, ...aliases } as never).type(
        def as never
      ) as Type;
      scopedDefCache.set(key, compiled);
    }
    return compiled;
  };

  return {
    compileDef,
    compileDefIn,

    isAssignable(candidate: Type, constraint: Type): boolean {
      // NUL separator: expressions contain spaces ("string | number"), so
      // any printable separator could make distinct pairs collide
      const key = keyOf(candidate) + "\0" + keyOf(constraint);
      let verdict = assignabilityCache.get(key);
      if (verdict === undefined) {
        try {
          verdict = candidate.extends(constraint);
        } catch {
          // e.g. "intersection of distinct morphs is indeterminate" —
          // conservatively not assignable, and safeParse stays no-throw
          verdict = false;
        }
        assignabilityCache.set(key, verdict);
      }
      return verdict;
    },

    isOverlapping(a: Type, b: Type): boolean {
      // symmetric: normalize the cache key order
      const [kx, ky] = [keyOf(a), keyOf(b)];
      const key = kx <= ky ? "?" + kx + "\0" + ky : "?" + ky + "\0" + kx;
      let verdict = assignabilityCache.get(key);
      if (verdict === undefined) {
        try {
          verdict = a.overlaps(b);
        } catch {
          verdict = false; // indeterminate → conservatively disjoint
        }
        assignabilityCache.set(key, verdict);
      }
      return verdict;
    },

    resolves(def: string): boolean {
      try {
        compileDef(def);
        return true;
      } catch {
        return false;
      }
    },

    resolvesWith(def: unknown, aliasNames: readonly string[]): boolean {
      // References validate as "unknown" placeholders at construction, so
      // defs applying operators/refinements to a reference ("left > 5")
      // fail here even though they could resolve per-parse — callers
      // surface that with a message naming the limitation (review F3)
      const placeholders: Record<string, Type> = {};
      for (const name of aliasNames) {
        placeholders[name] = compileDef("unknown");
      }
      try {
        compileDefIn(def, placeholders);
        return true;
      } catch {
        return false;
      }
    },
  };
}

/** Did validation produce arktype errors? */
export function isArkErrors(value: unknown): value is type.errors {
  return value instanceof type.errors;
}

// =============================================================================
// Parsed output Types on AST nodes
// =============================================================================

/**
 * Symbol key carrying a parsed subexpression's arktype Type. Symbol-keyed
 * so JSON serialization and Object.entries (the evaluator) never see it.
 */
export const OUTPUT_TYPE: unique symbol = Symbol("stringent.outputType");

/** Read the parsed Type off an AST node (undefined for nodes that never
 *  resolved one, e.g. deserialized ASTs). */
export function outputTypeOf(node: object): Type | undefined {
  return (node as { [OUTPUT_TYPE]?: Type })[OUTPUT_TYPE];
}

/** Attach the parsed Type non-enumerably: invisible to JSON serialization,
 *  Object.entries (the evaluator), and deep-equality assertions. */
export function setOutputType(node: object, type: Type): void {
  Object.defineProperty(node, OUTPUT_TYPE, {
    value: type,
    enumerable: false,
    configurable: true,
    writable: true,
  });
}

// =============================================================================
// Refinement erasure
// =============================================================================
//
// Expression TYPING runs on erased types (refinements like `number > 0`
// erase to `number`), keeping runtime constraint matching consistent with
// what TypeScript sees at compile time (TS has no refinement types).
// Refinements still do their real job at the VALUES boundary: evaluate()
// validates the values object against the full, un-erased schema.
//
// Mechanism: strip refinement-kind nodes via the internal transform API,
// then round-trip through type.schema(json) to re-normalize (the raw
// transform leaves an intersection shell that breaks extends symmetry).
// `.internal`/`transform` are not semver-frozen — this function is the
// single place they are touched.

const REFINEMENT_KINDS = new Set([
  "min",
  "max",
  "minLength",
  "maxLength",
  "exactLength",
  "pattern",
  "divisor",
  "before",
  "after",
  "predicate",
]);

const erasureCache = new WeakMap<Type, Type>();

/** Erase refinements from a Type (`number > 0` → `number`), deeply.
 *  Falls back to the original Type when the structure cannot round-trip
 *  (e.g. morphs). */
export function eraseRefinements(t: Type): Type {
  let erased = erasureCache.get(t);
  if (erased === undefined) {
    try {
      const stripped = (
        t as unknown as {
          internal: {
            transform: (
              mapper: (kind: string, inner: unknown) => unknown
            ) => { json: unknown };
          };
        }
      ).internal.transform((kind, inner) =>
        REFINEMENT_KINDS.has(kind) ? null : inner
      );
      erased = (type as unknown as { schema: (json: unknown) => Type }).schema(
        stripped.json
      );
    } catch {
      erased = t;
    }
    erasureCache.set(t, erased);
  }
  return erased;
}

/**
 * Resolve a dotted path against a compiled schema Type. Returns undefined
 * when the path doesn't exist in the schema (surfaced as the "unknown"
 * type upstream — constrained slots reject it, which is how "identifier
 * not in schema" becomes a TYPE_MISMATCH).
 */
export function resolveSchemaPath(
  schemaType: Type,
  segments: readonly string[]
): Type | undefined {
  try {
    // .get walks required/optional props; it throws for unknown keys.
    return (schemaType as unknown as { get: (...keys: string[]) => Type }).get(
      ...segments
    );
  } catch {
    return undefined;
  }
}
