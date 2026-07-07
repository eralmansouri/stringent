/**
 * Runtime Parser (v2)
 *
 * Precedence-climbing parser over the compiled grammar:
 *   1. Try operators at the current level (lowest precedence first)
 *   2. Fall back to the next level (higher precedence)
 *   3. Base case: the leaf level (highest precedence, plain alternation)
 *
 * Associativity is derived from each level's tail shape (see compile.ts):
 * left-associative levels parse with an iterative fold, right-associative
 * levels with recursive descent. Constraints are arktype Types; matching
 * is ASSIGNABILITY (memoized `extends`), and binding-reference constraints
 * resolve against already-parsed siblings.
 *
 * Parsed subexpressions carry their arktype Type on a symbol key
 * (OUTPUT_TYPE) so constraint checks compose without polluting the
 * serializable AST; `outputSchema` remains a display string.
 *
 * A mutable Diagnostics object is threaded through as a trailing parameter;
 * it records the furthest failure for error reporting and does not affect
 * control flow. This file MUST stay behaviorally in sync with the type-level
 * engine in src/parse/index.ts.
 */

import { Token } from "@sinclair/parsebox";
import type { Type } from "arktype";
import type { NodeSchema, PatternSchema, StringSchema, ConstSchema, ExprSchema } from "../schema/index.js";
import type {
  ASTNode,
  IdentNode,
  NumberNode,
  PathNode,
  StringNode,
} from "../primitive/index.js";
import {
  type CompiledConstraint,
  type CompiledGrammar,
  type CompiledNode,
} from "./compile.js";
import {
  eraseRefinements,
  outputTypeOf,
  resolveSchemaPath,
  setOutputType,
} from "./types.js";
import { type Diagnostics, createDiagnostics, fail, failConstraint } from "./diagnostics.js";

/** Parse result: empty = no match, [node, rest] = matched */
export type ParseResult<T extends ASTNode<any, any> = ASTNode<any, any>> =
  | []
  | [T & {}, string];

export { OUTPUT_TYPE } from "./types.js";

/** A grammar slice: levels[0] is the current level */
type Levels = readonly (readonly NodeSchema[])[];

/** Everything the parse needs beyond the input string */
interface ParseEnv {
  readonly compiled: CompiledGrammar;
  /** Compiled schema Type for identifier/path resolution (undefined = empty schema) */
  readonly schemaType: Type | undefined;
  readonly diag: Diagnostics;
}

// =============================================================================
// Primitive Parsers
// =============================================================================

function parseNumber(input: string, env: ParseEnv): ParseResult {
  const result = Token.Number(input) as [] | [string, string];
  if (result.length === 0) {
    fail(env.diag, input, "number");
    return [];
  }
  const node = {
    node: "literal",
    raw: result[0],
    value: +result[0],
    outputSchema: "number",
  } as NumberNode<(typeof result)[0]>;
  setOutputType(node, env.compiled.env.compileDef("number"));
  return [node, result[1]];
}

function parseString(
  quotes: readonly string[],
  input: string,
  env: ParseEnv
): ParseResult {
  const result = Token.String([...quotes], input) as [] | [string, string];
  if (result.length === 0) {
    fail(env.diag, input, "string");
    return [];
  }
  const node = {
    node: "literal",
    raw: result[0],
    value: result[0],
    outputSchema: "string",
  } as StringNode<(typeof result)[0]>;
  setOutputType(node, env.compiled.env.compileDef("string"));
  return [node, result[1]];
}

function parseIdent(input: string, env: ParseEnv): ParseResult {
  const result = Token.Ident(input) as [] | [string, string];
  if (result.length === 0) {
    fail(env.diag, input, "identifier");
    return [];
  }
  const name = result[0];
  const raw =
    env.schemaType === undefined
      ? undefined
      : resolveSchemaPath(env.schemaType, [name]);
  const resolved = raw === undefined ? undefined : eraseRefinements(raw);
  const node = {
    node: "identifier",
    name,
    outputSchema: resolved?.expression ?? "unknown",
  } as IdentNode<typeof name, string>;
  if (resolved !== undefined) setOutputType(node, resolved);
  return [node, result[1]];
}

/**
 * Parse a dotted path: ident(.ident)*
 *
 * Whitespace rules (mirrored exactly by the type-level engine):
 * - space BEFORE a dot ends the path ("values .p" → path ["values"], rest " .p")
 * - space AFTER a dot fails the whole element ("values. p" → no match)
 * - dangling dot fails the whole element ("values." → no match)
 */
function parsePath(input: string, env: ParseEnv): ParseResult {
  const first = Token.Ident(input) as [] | [string, string];
  if (first.length === 0) {
    fail(env.diag, input, "identifier");
    return [];
  }
  const segments: string[] = [first[0]];
  let rest = first[1];

  while (rest.startsWith(".")) {
    const afterDot = rest.slice(1);
    if (/^\s/.test(afterDot)) {
      fail(env.diag, afterDot, "identifier (no whitespace after '.')");
      return []; // "values. password" → fail whole element
    }
    const seg = Token.Ident(afterDot) as [] | [string, string];
    if (seg.length === 0) {
      fail(env.diag, afterDot, "identifier");
      return []; // dangling dot "values." → fail whole element
    }
    segments.push(seg[0]);
    rest = seg[1];
  }

  const raw =
    env.schemaType === undefined
      ? undefined
      : resolveSchemaPath(env.schemaType, segments);
  const resolved = raw === undefined ? undefined : eraseRefinements(raw);
  const node = {
    node: "path",
    path: segments,
    outputSchema: resolved?.expression ?? "unknown",
  } as PathNode<typeof segments, string>;
  if (resolved !== undefined) setOutputType(node, resolved);
  return [node, rest];
}

function parseConst(value: string, input: string, env: ParseEnv): ParseResult {
  const result = Token.Const(value, input) as [] | [string, string];
  if (result.length === 0) {
    fail(env.diag, input, `"${value}"`);
    return [];
  }
  return [{ node: "const", outputSchema: value }, result[1]];
}

// =============================================================================
// Constraint Resolution
// =============================================================================

interface ResolvedConstraint {
  /** undefined = unconstrained */
  readonly type: Type | undefined;
  /** "extends" = directional subtype; "overlaps" = symmetric */
  readonly check: "extends" | "overlaps";
  /** Human description for diagnostics */
  readonly describe: string | undefined;
}

const UNCONSTRAINED: ResolvedConstraint = {
  type: undefined,
  check: "extends",
  describe: undefined,
};

/**
 * Resolve an element's compiled constraint against already-parsed siblings.
 * Mirrors ResolveSpec in src/parse/index.ts.
 */
function resolveConstraint(
  constraint: CompiledConstraint | null,
  done: readonly PatternSchema[],
  children: readonly ASTNode[]
): ResolvedConstraint {
  if (constraint === null || constraint.kind === "none") return UNCONSTRAINED;
  if (constraint.kind === "static") {
    return {
      type: constraint.type,
      check: "extends",
      describe: constraint.describe,
    };
  }
  // Binding reference: find the referenced sibling's parsed Type
  const verb =
    constraint.check === "overlaps" ? "overlapping" : "type of";
  for (let i = 0; i < done.length; i++) {
    const el = done[i] as { __named?: boolean; name?: string };
    if (el.__named === true && el.name === constraint.binding) {
      const type = outputTypeOf(children[i]);
      return {
        type,
        check: constraint.check,
        describe:
          type === undefined
            ? `${verb} '${constraint.binding}' (unknown)`
            : `${type.expression} (${verb} '${constraint.binding}')`,
      };
    }
  }
  // Unreachable when compile.ts validated the pattern
  return {
    type: undefined,
    check: constraint.check,
    describe: `${verb} '${constraint.binding}'`,
  };
}

/** Assignability check: a candidate with no resolved Type ("unknown") is
 *  rejected by every constrained slot — that is how "identifier not in
 *  schema" surfaces as a TYPE_MISMATCH. */
function constraintAccepts(
  env: ParseEnv,
  constraint: ResolvedConstraint,
  candidate: Type | undefined
): boolean {
  if (constraint.type === undefined) return true;
  if (candidate === undefined) return false;
  return constraint.check === "overlaps"
    ? env.compiled.env.isOverlapping(candidate, constraint.type)
    : env.compiled.env.isAssignable(candidate, constraint.type);
}

// =============================================================================
// Pattern Element Parsing
// =============================================================================

function parseElement(
  element: PatternSchema,
  input: string,
  env: ParseEnv
): ParseResult {
  switch (element.kind) {
    case "number":
      return parseNumber(input, env);
    case "string":
      return parseString((element as StringSchema).quotes, input, env);
    case "ident":
      return parseIdent(input, env);
    case "path":
      return parsePath(input, env);
    case "const":
      return parseConst((element as ConstSchema).value, input, env);
    default:
      return [];
  }
}

/**
 * Parse an expression element based on its role.
 *
 * Role determines which grammar slice is used:
 * - "lhs": nextLevels (a tighter expression; avoids left-recursion)
 * - "rhs": currentLevels (same level → right-associative recursion)
 * - "expr": fullGrammar (full reset; only in delimited contexts)
 */
function parseElementWithLevel(
  element: PatternSchema,
  constraintSpec: CompiledConstraint | null,
  input: string,
  currentLevels: Levels,
  nextLevels: Levels,
  done: readonly PatternSchema[],
  children: readonly ASTNode[],
  env: ParseEnv
): ParseResult {
  if (element.kind === "expr") {
    const constraint = resolveConstraint(constraintSpec, done, children);
    const role = (element as ExprSchema).role;
    const levels =
      role === "lhs" ? nextLevels
      : role === "rhs" ? currentLevels
      : env.compiled.levels;
    return parseExprWithConstraint(levels, input, constraint, env);
  }
  return parseElement(element, input, env);
}

/**
 * Parse a pattern tuple.
 *
 * seedDone/seedChildren pre-populate the consumed prefix (used by the
 * left-fold to make binding references like rhs("left") resolvable inside
 * operator tails). The returned children INCLUDE the seeded prefix,
 * aligned with the node's full pattern.
 */
function parsePatternTuple(
  node: NodeSchema,
  compiledNode: CompiledNode,
  startIndex: number,
  input: string,
  currentLevels: Levels,
  nextLevels: Levels,
  env: ParseEnv,
  seedChildren: readonly ASTNode[] = []
): [] | [ASTNode[], string] {
  let remaining = input;
  const done: PatternSchema[] = [...node.pattern.slice(0, startIndex)];
  const children: ASTNode[] = [...seedChildren];

  for (let i = startIndex; i < node.pattern.length; i++) {
    const element = node.pattern[i];
    const result = parseElementWithLevel(
      element,
      compiledNode.constraints[i],
      remaining,
      currentLevels,
      nextLevels,
      done,
      children,
      env
    );
    if (result.length === 0) return [];
    done.push(element);
    children.push(result[0]);
    remaining = result[1];
  }

  return [children, remaining];
}

/**
 * Extract named bindings from pattern and children.
 * Only includes children where the pattern element has .as(name).
 */
function extractBindings(
  pattern: readonly PatternSchema[],
  children: readonly ASTNode[]
): Record<string, ASTNode> {
  const bindings: Record<string, ASTNode> = {};

  for (let i = 0; i < pattern.length; i++) {
    const element = pattern[i];
    if ("__named" in element && element.__named === true) {
      bindings[(element as { name: string }).name] = children[i];
    }
  }

  return bindings;
}

/**
 * Build AST node from parsed children.
 *
 * - Single unnamed non-const child → passthrough (leaf alternation entry)
 * - Otherwise: bindings become node fields; the output Type comes from the
 *   compiled resultType (static def, or the referenced binding's parsed
 *   Type). Mirrors ResultSchemaOf in src/parse/index.ts.
 */
function buildNodeResult(
  node: NodeSchema,
  compiledNode: CompiledNode,
  children: readonly ASTNode[]
): ASTNode {
  const result = compiledNode.result;
  if (result.kind === "passthrough") return children[0];

  const bindings = extractBindings(node.pattern, children);

  let outputType: Type | undefined;
  let outputSchema: string;
  if (result.kind === "static") {
    outputType = result.type;
    outputSchema = result.type.expression;
  } else {
    const bound = bindings[result.binding];
    outputType = bound === undefined ? undefined : outputTypeOf(bound);
    outputSchema =
      outputType?.expression ??
      (bound as { outputSchema?: string } | undefined)?.outputSchema ??
      "unknown";
  }

  const built = {
    node: node.name,
    outputSchema,
    ...bindings,
  } as ASTNode;
  if (outputType !== undefined) setOutputType(built, outputType);
  return built;
}

/**
 * Parse a node pattern from its start.
 */
function parseNodePattern(
  node: NodeSchema,
  input: string,
  currentLevels: Levels,
  nextLevels: Levels,
  env: ParseEnv
): ParseResult {
  const compiledNode = env.compiled.byNode.get(node)!;
  const result = parsePatternTuple(
    node,
    compiledNode,
    0,
    input,
    currentLevels,
    nextLevels,
    env
  );
  if (result.length === 0) return [];
  return [buildNodeResult(node, compiledNode, result[0]), result[1]];
}

/**
 * Parse with expression constraint check.
 */
function parseExprWithConstraint(
  startLevels: Levels,
  input: string,
  constraint: ResolvedConstraint,
  env: ParseEnv
): ParseResult {
  const result = parseLevels(startLevels, input, env);
  if (result.length === 0) return [];

  const [node, remaining] = result;

  if (!constraintAccepts(env, constraint, outputTypeOf(node))) {
    failConstraint(
      env.diag,
      input,
      remaining,
      constraint.describe ?? "expression",
      (node as { outputSchema?: string }).outputSchema ?? "unknown",
      subjectOf(node)
    );
    return [];
  }

  return [node, remaining];
}

/** Identifier/path text of a node, for constraint mismatch messages */
function subjectOf(node: ASTNode): string | undefined {
  if (node.node === "identifier") return (node as { name?: string }).name;
  if (node.node === "path") {
    return (node as { path?: readonly string[] }).path?.join(".");
  }
  return undefined;
}

/**
 * Try parsing each node in a level (recursive-descent / leaf alternation).
 */
function parseNodes(
  nodes: readonly NodeSchema[],
  input: string,
  currentLevels: Levels,
  nextLevels: Levels,
  env: ParseEnv
): ParseResult {
  for (const node of nodes) {
    const result = parseNodePattern(node, input, currentLevels, nextLevels, env);
    if (result.length === 2) return result;
  }
  return [];
}

// =============================================================================
// Left-Associative Level Parsing
// =============================================================================

/**
 * Parse a left-associative level: seed with an operand from the next level,
 * then fold `op operand` repetitions into left-nested nodes.
 * "5-2-1" → sub(sub(5, 2), 1)
 *
 * Tail operands are lhs(...) elements, so they parse at the next level via
 * their role — the fold itself is what makes the level left-associative.
 * Mirrors ParseLeftLevel/ParseLeftFold in src/parse/index.ts.
 */
function parseLeftLevel(levels: Levels, input: string, env: ParseEnv): ParseResult {
  const nodes = levels[0];
  const nextLevels = levels.slice(1);

  const seed = parseLevels(nextLevels, input, env);
  if (seed.length === 0) return [];

  let [left, rest] = seed;

  outer: for (;;) {
    for (const node of nodes) {
      const compiledNode = env.compiled.byNode.get(node)!;

      // Check the folded-so-far node against the lhs constraint. Record
      // mismatches so schema typos surface in errors (the seed's start
      // offset is the operand's position).
      const constraint = resolveConstraint(compiledNode.constraints[0], [], []);
      if (!constraintAccepts(env, constraint, outputTypeOf(left))) {
        failConstraint(
          env.diag,
          input,
          rest,
          constraint.describe ?? "expression",
          (left as { outputSchema?: string }).outputSchema ?? "unknown",
          subjectOf(left)
        );
        continue;
      }

      // Fold the tail; children are seeded with the left operand so
      // binding references to it resolve.
      const tailResult = parsePatternTuple(
        node,
        compiledNode,
        1,
        rest,
        levels,
        nextLevels,
        env,
        [left]
      );
      if (tailResult.length === 0) continue;

      // Defensive: a zero-width tail would loop forever (createParser
      // validation makes this unreachable)
      if (tailResult[1] === rest) continue;

      left = buildNodeResult(node, compiledNode, tailResult[0]);
      rest = tailResult[1];
      continue outer;
    }
    return [left, rest];
  }
}

/**
 * Parse using grammar levels (flat tuple).
 *
 * levels[0] is the current level, levels[1:] are the tighter levels.
 * The level's mode (from the compiled grammar) picks the strategy.
 */
function parseLevels(levels: Levels, input: string, env: ParseEnv): ParseResult {
  if (levels.length === 0) return [];

  const modeIndex = env.compiled.levels.length - levels.length;
  const mode = env.compiled.modes[modeIndex];

  if (mode === "left") {
    return parseLeftLevel(levels, input, env);
  }

  const nextLevels = levels.slice(1);
  const result = parseNodes(levels[0], input, levels, nextLevels, env);
  if (result.length === 2) return result;

  if (nextLevels.length > 0) {
    return parseLevels(nextLevels, input, env);
  }
  return [];
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Parse input against a compiled grammar.
 *
 * Returns the raw [node, rest] | [] result plus the diagnostics gathered
 * during parsing. Prefer parser.parse() / parser.safeParse() from
 * createParser for a friendlier API.
 */
export function parseWithDiagnostics(
  compiled: CompiledGrammar,
  input: string,
  schemaType: Type | undefined
): { result: ParseResult; diagnostics: Diagnostics } {
  const diagnostics = createDiagnostics(input);
  const env: ParseEnv = { compiled, schemaType, diag: diagnostics };
  const result = parseLevels(compiled.levels, input, env);
  return { result, diagnostics };
}
