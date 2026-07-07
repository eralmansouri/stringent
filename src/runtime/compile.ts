/**
 * Grammar compilation & validation (v2)
 *
 * Validates node schemas at construction time and precompiles everything
 * the runtime engine needs:
 * - each expr slot's constraint, classified as unconstrained, a BINDING
 *   REFERENCE (names an earlier binding), or a STATIC arktype def
 *   (compiled once here)
 * - each node's resultType, classified as passthrough, binding reference,
 *   or static def
 * - precedence levels sorted ascending, with each level's parse mode
 *   derived from its nodes' tail shape:
 *     · tail parses at the current level (rhs)  → "right"
 *     · tail parses at a tighter level (lhs) or the pattern is closed
 *       (ends in a consuming element)           → "left" (iterative fold)
 *     · the highest level is the LEAF level     → plain alternation
 *
 * Construction errors throw immediately — a typo'd constraint def or an
 * ambiguous level must never become a silently dead grammar rule.
 */

import type { Type } from "arktype";
import {
  isOverlapsRef,
  type ExprSchema,
  type NodeSchema,
  type PatternSchema,
} from "../schema/index.js";
import { RESERVED_NODE_NAMES } from "./evaluate.js";
import { createTypeEnv, eraseRefinements, type ScopeAliases, type TypeEnv } from "./types.js";

// =============================================================================
// Compiled structures
// =============================================================================

export type CompiledConstraint =
  | { readonly kind: "none" }
  | {
      readonly kind: "ref";
      readonly binding: string;
      /** "extends" = directional subtype; "overlaps" = symmetric */
      readonly check: "extends" | "overlaps";
    }
  | { readonly kind: "static"; readonly type: Type; readonly describe: string };

export type CompiledResult =
  | { readonly kind: "passthrough" }
  | { readonly kind: "ref"; readonly binding: string }
  | { readonly kind: "static"; readonly type: Type; readonly describe: string };

export interface CompiledNode {
  /** One entry per pattern element (null for non-expr elements) */
  readonly constraints: readonly (CompiledConstraint | null)[];
  readonly result: CompiledResult;
}

export type LevelMode = "right" | "left" | "leaf";

export interface CompiledGrammar {
  readonly env: TypeEnv;
  readonly byNode: ReadonlyMap<NodeSchema, CompiledNode>;
  /** Levels sorted by precedence ascending; the last level is the leaf level */
  readonly levels: readonly (readonly NodeSchema[])[];
  /** Parse mode per level, aligned with `levels` */
  readonly modes: readonly LevelMode[];
}

// =============================================================================
// Helpers
// =============================================================================

const CONSUMING_KINDS = new Set(["number", "string", "ident", "path", "const"]);

/** Binding names that would collide with AST node structure or JS proto
 *  setter semantics */
const RESERVED_BINDING_NAMES = new Set(["node", "outputSchema", "__proto__"]);

function isNamed(
  element: PatternSchema
): element is PatternSchema & { name: string } {
  return "__named" in element && element.__named === true;
}

function isExpr(element: PatternSchema): element is ExprSchema {
  return element.kind === "expr";
}

/** The tail shape of a pattern decides its level's associativity */
function tailShapeOf(node: NodeSchema): "rhs" | "lhs" | "closed" {
  const last = node.pattern[node.pattern.length - 1];
  if (isExpr(last)) {
    // expr() cannot be last (validated); lhs/rhs decide the level mode
    return last.role === "rhs" ? "rhs" : "lhs";
  }
  return "closed";
}

// =============================================================================
// Compilation + validation
// =============================================================================

export function compileGrammar(
  nodes: readonly NodeSchema[],
  aliases: ScopeAliases | undefined
): CompiledGrammar {
  const env = createTypeEnv(aliases);
  const byNode = new Map<NodeSchema, CompiledNode>();
  const seen = new Set<string>();

  if (nodes.length === 0) {
    throw new Error("stringent: createParser needs at least one node");
  }

  for (const node of nodes) {
    if (seen.has(node.name)) {
      throw new Error(`stringent: duplicate node name '${node.name}'`);
    }
    if (RESERVED_NODE_NAMES.has(node.name)) {
      throw new Error(
        `stringent: node name '${node.name}' is reserved (used by the parser's primitive nodes)`
      );
    }
    seen.add(node.name);

    if (node.pattern.length === 0) {
      throw new Error(`stringent: node '${node.name}' has an empty pattern`);
    }

    const prec = node.precedence;
    if (typeof prec !== "number" || !Number.isSafeInteger(prec) || prec < 0) {
      throw new Error(
        `stringent: node '${node.name}' has invalid precedence ${String(
          prec
        )} — precedence must be a non-negative safe integer (the highest level is the leaf level)`
      );
    }

    byNode.set(node, compileNode(node, env));
  }

  // --- Levels & modes -------------------------------------------------------
  const byPrecedence = new Map<number, NodeSchema[]>();
  for (const node of nodes) {
    const level = byPrecedence.get(node.precedence) ?? [];
    level.push(node);
    byPrecedence.set(node.precedence, level);
  }
  const precedences = [...byPrecedence.keys()].sort((a, b) => a - b);
  const levels = precedences.map((p) => byPrecedence.get(p)!);
  const leafIndex = levels.length - 1;

  const modes: LevelMode[] = levels.map((levelNodes, i) => {
    if (i === leafIndex) return "leaf";
    const shapes = new Set(levelNodes.map(tailShapeOf));
    if (shapes.has("rhs") && shapes.has("lhs")) {
      throw new Error(
        `stringent: precedence ${precedences[i]} mixes tail shapes — a level is right-associative (tail rhs(...)) or left-associative (tail lhs(...) / closed), never both. Nodes: ${levelNodes
          .map((n) => n.name)
          .join(", ")}`
      );
    }
    return shapes.has("rhs") ? "right" : "left";
  });

  // --- Level-mode-dependent pattern rules ------------------------------------
  levels.forEach((levelNodes, i) => {
    for (const node of levelNodes) {
      const first = node.pattern[0];
      if (modes[i] === "leaf") {
        if (!CONSUMING_KINDS.has(first.kind)) {
          throw new Error(
            `stringent: leaf node '${node.name}' (highest precedence level) must start with a consuming element (number, string, ident, path, const)`
          );
        }
      } else if (modes[i] === "left") {
        if (!isExpr(first) || first.role !== "lhs") {
          throw new Error(
            `stringent: node '${node.name}' sits on a left-associative level (a sibling's tail is lhs(...) or closed), so its pattern must start with lhs(...) — prefix operators belong on right-associative levels`
          );
        }
      } else if (isExpr(first) && first.role !== "lhs") {
        throw new Error(
          `stringent: node '${node.name}' starts with ${first.role}(...), which would recurse into the same level forever — operator patterns must start with lhs(...) or a consuming element`
        );
      }
    }
  });

  return { env, byNode, levels, modes };
}

// =============================================================================
// Per-node compilation
// =============================================================================

function compileNode(node: NodeSchema, env: TypeEnv): CompiledNode {
  const namedSoFar = new Map<string, PatternSchema>();
  const allNamed = new Map<string, PatternSchema>();
  for (const element of node.pattern) {
    if (isNamed(element)) allNamed.set(element.name, element);
  }

  const constraints: (CompiledConstraint | null)[] = [];

  node.pattern.forEach((element, index) => {
    if (element.kind === "const" && (element as { value: string }).value === "") {
      throw new Error(
        `stringent: node '${node.name}' uses constVal("") — empty constants match zero width and cannot terminate`
      );
    }

    if (isExpr(element)) {
      // expr() must be delimiter-bounded: a constVal must follow it,
      // otherwise it swallows looser operators and breaks precedence
      // (`10 - 5 == 2` would parse as `10 - (5 == 2)`).
      if (element.role === "expr") {
        const closed = node.pattern
          .slice(index + 1)
          .some((later) => later.kind === "const");
        if (!closed) {
          throw new Error(
            `stringent: node '${node.name}' has an expr() element with no constVal after it — expr() resets to the full grammar and must be closed by a delimiter (use rhs()/lhs() for final operands)`
          );
        }
      }
      constraints.push(compileConstraint(node, element, index, namedSoFar, env));
    } else {
      constraints.push(null);
    }

    if (isNamed(element)) {
      if (RESERVED_BINDING_NAMES.has(element.name)) {
        throw new Error(
          `stringent: node '${node.name}' uses the binding name '${element.name}', which would collide with the AST node structure`
        );
      }
      if (namedSoFar.has(element.name)) {
        throw new Error(
          `stringent: node '${node.name}' binds the name '${element.name}' twice — binding names must be unique within a pattern`
        );
      }
      if (env.resolves(element.name)) {
        throw new Error(
          `stringent: node '${node.name}' binds the name '${element.name}', which is also a resolvable type in this parser's scope — binding names must not shadow types (rename the binding or the scope alias)`
        );
      }
      namedSoFar.set(element.name, element);
    }
  });

  return {
    constraints,
    result: compileResult(node, allNamed, env),
  };
}

function compileConstraint(
  node: NodeSchema,
  element: ExprSchema,
  index: number,
  namedSoFar: ReadonlyMap<string, PatternSchema>,
  env: TypeEnv
): CompiledConstraint {
  const spec = element.constraint;
  if (spec === undefined) return { kind: "none" };

  if (isOverlapsRef(spec)) {
    const target = namedSoFar.get(spec.binding);
    if (target === undefined) {
      throw new Error(
        `stringent: node '${node.name}' uses overlapping('${spec.binding}') but no earlier element is named '${spec.binding}'`
      );
    }
    if (target.kind === "const") {
      throw new Error(
        `stringent: node '${node.name}' uses overlapping('${spec.binding}') on a const element — const bindings carry their matched text, not a type`
      );
    }
    return { kind: "ref", binding: spec.binding, check: "overlaps" };
  }

  if (typeof spec !== "string") {
    throw new Error(
      `stringent: node '${node.name}' has a non-string constraint — constraints are arktype defs, binding names, or overlapping(binding)`
    );
  }

  // A constraint naming an EARLIER binding is a reference to its parsed type
  const target = namedSoFar.get(spec);
  if (target !== undefined) {
    if (target.kind === "const") {
      throw new Error(
        `stringent: node '${node.name}' constrains a slot to binding '${spec}', which is a const element — const bindings carry their matched text, which no expression can produce`
      );
    }
    return { kind: "ref", binding: spec, check: "extends" };
  }

  if (index === 0 && element.role === "lhs" && /^[A-Za-z_$][\w$]*$/.test(spec) && !env.resolves(spec)) {
    throw new Error(
      `stringent: node '${node.name}' constrains its first element to '${spec}', which is neither a type in scope nor an earlier binding (position 0 has no earlier operands to reference)`
    );
  }

  try {
    const compiled = eraseRefinements(env.compileDef(spec));
    return { kind: "static", type: compiled, describe: spec };
  } catch (e) {
    throw new Error(
      `stringent: node '${node.name}' has constraint '${spec}', which is neither an earlier binding name nor a valid type in this parser's scope — ${(e as Error).message}`
    );
  }
}

function compileResult(
  node: NodeSchema,
  allNamed: ReadonlyMap<string, PatternSchema>,
  env: TypeEnv
): CompiledResult {
  const spec = node.resultType;
  const hasNamed = allNamed.size > 0;
  const isPassthrough =
    !hasNamed && node.pattern.length === 1 && node.pattern[0].kind !== "const";

  if (spec === undefined) {
    if (isPassthrough) return { kind: "passthrough" };
    throw new Error(
      `stringent: node '${node.name}' needs a resultType (an arktype def or a binding name) — only single-element passthrough patterns can omit it`
    );
  }
  if (isPassthrough) {
    throw new Error(
      `stringent: node '${node.name}' is a single-element passthrough — it forwards its child unchanged, so a resultType would never apply. Remove it.`
    );
  }

  if (typeof spec === "string") {
    const target = allNamed.get(spec);
    if (target !== undefined) {
      if (target.kind === "const") {
        throw new Error(
          `stringent: node '${node.name}' derives resultType from binding '${spec}', which is a const element — const bindings carry their matched text, not a type`
        );
      }
      return { kind: "ref", binding: spec };
    }
  }

  try {
    const compiled = eraseRefinements(env.compileDef(spec));
    return {
      kind: "static",
      type: compiled,
      describe: typeof spec === "string" ? spec : compiled.expression,
    };
  } catch (e) {
    throw new Error(
      `stringent: node '${node.name}' has resultType ${JSON.stringify(
        spec
      )}, which is neither a binding name nor a valid type in this parser's scope — ${(e as Error).message}`
    );
  }
}
