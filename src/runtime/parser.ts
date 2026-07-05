/**
 * Runtime Parser
 *
 * Mirrors the type-level Parse<Grammar, Input, Context> at runtime.
 * Uses the same precedence-based parsing strategy:
 *   1. Try operators at current level (lowest precedence first)
 *   2. Fall back to next level (higher precedence)
 *   3. Base case: try atoms (last level)
 *
 * Left-associative levels are parsed with an iterative fold, mirroring
 * ParseLeftLevel in src/parse/index.ts. Constraints resolve against
 * already-parsed siblings (sameAs) and result types may derive from
 * operands (fromBinding).
 *
 * A mutable Diagnostics object is threaded through as a trailing parameter;
 * it records the furthest failure for error reporting and does not affect
 * control flow. This file MUST stay behaviorally in sync with the type-level
 * engine in src/parse/index.ts — the parity test suite guards this.
 */

import { Token } from "@sinclair/parsebox";
import type { Context } from "../context.js";
import type { ComputeGrammar, Grammar } from "../grammar/index.js";
import type { Parse } from "../parse/index.js";
import {
  type NodeSchema,
  type PatternSchema,
  type StringSchema,
  type ConstSchema,
  type ExprSchema,
  isFromBinding,
  isSameAs,
} from "../schema/index.js";

import type {
  ASTNode,
  IdentNode,
  NumberNode,
  PathNode,
  StringNode,
} from "../primitive/index.js";

import { type Diagnostics, createDiagnostics, fail, failConstraint } from "./diagnostics.js";

/** Parse result: empty = no match, [node, rest] = matched */
export type ParseResult<T extends ASTNode<any, any> = ASTNode<any, any>> =
  | []
  | [T & {}, string];

// =============================================================================
// Primitive Parsers
// =============================================================================

function parseNumber(input: string, diag: Diagnostics): ParseResult {
  const result = Token.Number(input) as [] | [string, string];
  if (result.length === 0) {
    fail(diag, input, "number");
    return [];
  }
  return [
    {
      node: "literal",
      raw: result[0],
      value: +result[0],
      outputSchema: "number",
    } as NumberNode<(typeof result)[0]>,
    result[1],
  ];
}

function parseString(
  quotes: readonly string[],
  input: string,
  diag: Diagnostics
): ParseResult {
  const result = Token.String([...quotes], input) as [] | [string, string];
  if (result.length === 0) {
    fail(diag, input, "string");
    return [];
  }
  return [
    {
      node: "literal",
      raw: result[0],
      value: result[0],
      outputSchema: "string",
    } as StringNode<(typeof result)[0]>,
    result[1],
  ];
}

/** Resolve an identifier's type from (possibly nested) schema data.
 *  Own properties only — prototype members must not leak into the schema. */
function resolveIdent(data: Record<string, unknown>, name: string): string {
  const value = Object.hasOwn(data, name) ? data[name] : undefined;
  return typeof value === "string" ? value : "unknown";
}

function parseIdent(
  input: string,
  context: Context,
  diag: Diagnostics
): ParseResult {
  const result = Token.Ident(input) as [] | [string, string];
  if (result.length === 0) {
    fail(diag, input, "identifier");
    return [];
  }
  const name = result[0];
  const valueType = resolveIdent(context.data, name);
  return [
    { node: "identifier", name, outputSchema: valueType } as IdentNode<
      typeof name,
      typeof valueType
    >,
    result[1],
  ];
}

/** Resolve a dotted path against (possibly nested) schema data.
 *  Own properties only — prototype members must not leak into the schema. */
export function resolvePath(data: unknown, segments: readonly string[]): string {
  let current: unknown = data;
  for (const segment of segments) {
    if (
      current !== null &&
      typeof current === "object" &&
      Object.hasOwn(current, segment)
    ) {
      current = (current as Record<string, unknown>)[segment];
    } else {
      return "unknown";
    }
  }
  return typeof current === "string" ? current : "unknown";
}

/**
 * Parse a dotted path: ident(.ident)*
 *
 * Whitespace rules (mirrored exactly by the type-level engine):
 * - space BEFORE a dot ends the path ("values .p" → path ["values"], rest " .p")
 * - space AFTER a dot fails the whole element ("values. p" → no match)
 * - dangling dot fails the whole element ("values." → no match)
 */
function parsePath(
  input: string,
  context: Context,
  diag: Diagnostics
): ParseResult {
  const first = Token.Ident(input) as [] | [string, string];
  if (first.length === 0) {
    fail(diag, input, "identifier");
    return [];
  }
  const segments: string[] = [first[0]];
  let rest = first[1];

  while (rest.startsWith(".")) {
    const afterDot = rest.slice(1);
    if (/^\s/.test(afterDot)) {
      fail(diag, afterDot, "identifier (no whitespace after '.')");
      return []; // "values. password" → fail whole element
    }
    const seg = Token.Ident(afterDot) as [] | [string, string];
    if (seg.length === 0) {
      fail(diag, afterDot, "identifier");
      return []; // dangling dot "values." → fail whole element
    }
    segments.push(seg[0]);
    rest = seg[1];
  }

  const valueType = resolvePath(context.data, segments);
  return [
    { node: "path", path: segments, outputSchema: valueType } as PathNode<
      typeof segments,
      typeof valueType
    >,
    rest,
  ];
}

function parseConst(
  value: string,
  input: string,
  diag: Diagnostics
): ParseResult {
  const result = Token.Const(value, input) as [] | [string, string];
  if (result.length === 0) {
    fail(diag, input, `"${value}"`);
    return [];
  }
  return [{ node: "const", outputSchema: value }, result[1]];
}

// =============================================================================
// Build Runtime Grammar from Node Schemas
// =============================================================================

/**
 * Build runtime grammar from node schemas.
 *
 * Returns a flat tuple of levels:
 *   [[ops@prec1], [ops@prec2], ..., [atoms]]
 *
 * Levels are sorted by precedence ascending (lowest first).
 * Atoms are always the last level.
 */
export function buildGrammar(nodes: readonly NodeSchema[]): Grammar {
  const atoms: NodeSchema[] = [];
  const operators: Map<number, NodeSchema[]> = new Map();

  for (const node of nodes) {
    if (node.precedence === "atom") {
      atoms.push(node);
    } else {
      const prec = node.precedence as number;
      if (!operators.has(prec)) {
        operators.set(prec, []);
      }
      operators.get(prec)!.push(node);
    }
  }

  // Sort precedences ascending
  const precedences = [...operators.keys()].sort((a, b) => a - b);

  // Build flat grammar: [[ops@prec1], [ops@prec2], ..., [atoms]]
  const grammar: (readonly NodeSchema[])[] = [];
  for (const prec of precedences) {
    grammar.push(operators.get(prec)!);
  }
  grammar.push(atoms);

  return grammar;
}

// =============================================================================
// Constraint Resolution
// =============================================================================

interface ResolvedConstraint {
  /** undefined = unconstrained; string = exact; string[] = any-of */
  readonly accepted: string | readonly string[] | undefined;
  /** Human description for diagnostics */
  readonly describe: string | undefined;
}

const UNCONSTRAINED: ResolvedConstraint = {
  accepted: undefined,
  describe: undefined,
};

/**
 * Resolve an element's constraint against the already-parsed siblings.
 * Mirrors ResolveSpec in src/parse/index.ts.
 */
function resolveConstraintSpec(
  element: PatternSchema,
  done: readonly PatternSchema[],
  children: readonly ASTNode[]
): ResolvedConstraint {
  const spec = (element as ExprSchema).constraint;
  if (spec === undefined) return UNCONSTRAINED;
  if (typeof spec === "string") return { accepted: spec, describe: spec };
  if (isSameAs(spec)) {
    let resolved = "unknown";
    for (let i = 0; i < done.length; i++) {
      const el = done[i] as { __named?: boolean; name?: string };
      if (el.__named === true && el.name === spec.binding) {
        const out = (children[i] as { outputSchema?: unknown }).outputSchema;
        resolved = typeof out === "string" ? out : "unknown";
        break;
      }
    }
    return {
      accepted: resolved,
      describe: `${resolved} (same type as '${spec.binding}')`,
    };
  }
  // readonly string[]
  return { accepted: spec, describe: spec.join(" | ") };
}

/** Check an outputSchema against a resolved constraint (exact-name semantics).
 *  Mirrors CheckConstraint in src/parse/index.ts. */
function constraintAccepts(
  constraint: ResolvedConstraint,
  outputSchema: string | undefined
): boolean {
  const accepted = constraint.accepted;
  if (accepted === undefined) return true;
  if (typeof accepted === "string") return outputSchema === accepted;
  return outputSchema !== undefined && accepted.includes(outputSchema);
}

// =============================================================================
// Pattern Element Parsing
// =============================================================================

/**
 * Parse a single pattern element (non-Expr).
 */
function parseElement(
  element: PatternSchema,
  input: string,
  context: Context,
  diag: Diagnostics
): ParseResult {
  switch (element.kind) {
    case "number":
      return parseNumber(input, diag);
    case "string":
      return parseString((element as StringSchema).quotes, input, diag);
    case "ident":
      return parseIdent(input, context, diag);
    case "path":
      return parsePath(input, context, diag);
    case "const":
      return parseConst((element as ConstSchema).value, input, diag);
    default:
      return [];
  }
}

/**
 * Parse an expression element based on its role.
 *
 * Role determines which grammar slice is used:
 * - "lhs": nextLevels (avoids left-recursion)
 * - "rhs": currentLevels (maintains precedence, enables right-associativity)
 * - "expr": fullGrammar (full reset for delimited contexts)
 */
function parseElementWithLevel(
  element: PatternSchema,
  input: string,
  context: Context,
  currentLevels: Grammar,
  nextLevels: Grammar,
  fullGrammar: Grammar,
  done: readonly PatternSchema[],
  children: readonly ASTNode[],
  diag: Diagnostics
): ParseResult {
  if (element.kind === "expr") {
    const constraint = resolveConstraintSpec(element, done, children);
    const role = (element as ExprSchema).role;

    if (role === "lhs") {
      return parseExprWithConstraint(
        nextLevels,
        input,
        context,
        constraint,
        fullGrammar,
        diag
      );
    } else if (role === "rhs") {
      return parseExprWithConstraint(
        currentLevels,
        input,
        context,
        constraint,
        fullGrammar,
        diag
      );
    } else {
      return parseExprWithConstraint(
        fullGrammar,
        input,
        context,
        constraint,
        fullGrammar,
        diag
      );
    }
  }
  return parseElement(element, input, context, diag);
}

/**
 * Parse a pattern tuple.
 *
 * seedDone/seedChildren pre-populate the consumed prefix (used by the
 * left-fold to make sameAs("left") resolvable inside operator tails).
 * The returned children INCLUDE the seeded prefix, aligned with the node's
 * full pattern.
 */
function parsePatternTuple(
  pattern: readonly PatternSchema[],
  input: string,
  context: Context,
  currentLevels: Grammar,
  nextLevels: Grammar,
  fullGrammar: Grammar,
  diag: Diagnostics,
  seedDone: readonly PatternSchema[] = [],
  seedChildren: readonly ASTNode[] = []
): [] | [ASTNode[], string] {
  let remaining = input;
  const done: PatternSchema[] = [...seedDone];
  const children: ASTNode[] = [...seedChildren];

  for (const element of pattern) {
    const result = parseElementWithLevel(
      element,
      remaining,
      context,
      currentLevels,
      nextLevels,
      fullGrammar,
      done,
      children,
      diag
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
    const child = children[i];

    // Check if element is a NamedSchema (has __named and name properties)
    if ("__named" in element && element.__named === true) {
      bindings[(element as { name: string }).name] = child;
    }
  }

  return bindings;
}

/** Compute a node's outputSchema: static string, or derived via fromBinding.
 *  Mirrors ResultSchemaOf in src/parse/index.ts. */
function resultSchemaOf(
  nodeSchema: NodeSchema,
  bindings: Record<string, ASTNode>
): string {
  const spec = nodeSchema.resultType;
  if (isFromBinding(spec)) {
    const bound = bindings[spec.binding] as { outputSchema?: unknown } | undefined;
    return bound !== undefined && typeof bound.outputSchema === "string"
      ? bound.outputSchema
      : "unknown";
  }
  return typeof spec === "string" ? spec : "unknown";
}

/**
 * Build AST node from parsed children.
 *
 * - Single unnamed non-const child → passthrough (atom behavior)
 * - Otherwise: bindings become node fields, outputSchema from resultSchemaOf
 */
function buildNodeResult(
  nodeSchema: NodeSchema,
  children: readonly ASTNode[]
): ASTNode {
  const bindings = extractBindings(nodeSchema.pattern, children);

  // Single unnamed non-const child → passthrough (atom behavior)
  if (
    Object.keys(bindings).length === 0 &&
    children.length === 1 &&
    children[0].node !== "const"
  ) {
    return children[0];
  }

  // Build node with bindings as fields
  return {
    node: nodeSchema.name,
    outputSchema: resultSchemaOf(nodeSchema, bindings),
    ...bindings,
  } as ASTNode;
}

/**
 * Parse a node pattern.
 */
function parseNodePattern(
  node: NodeSchema,
  input: string,
  context: Context,
  currentLevels: Grammar,
  nextLevels: Grammar,
  fullGrammar: Grammar,
  diag: Diagnostics
): ParseResult {
  const result = parsePatternTuple(
    node.pattern,
    input,
    context,
    currentLevels,
    nextLevels,
    fullGrammar,
    diag
  );
  if (result.length === 0) return [];
  return [buildNodeResult(node, result[0]), result[1]];
}

/**
 * Parse with expression constraint check.
 */
function parseExprWithConstraint(
  startLevels: Grammar,
  input: string,
  context: Context,
  constraint: ResolvedConstraint,
  fullGrammar: Grammar,
  diag: Diagnostics
): ParseResult {
  const result = parseLevels(startLevels, input, context, fullGrammar, diag);
  if (result.length === 0) return [];

  const [node, remaining] = result;

  const outputSchema = (node as { outputSchema?: string }).outputSchema;
  if (!constraintAccepts(constraint, outputSchema)) {
    failConstraint(
      diag,
      input,
      remaining,
      constraint.describe ?? "expression",
      outputSchema ?? "unknown",
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
 * Try parsing each node in a level.
 */
function parseNodes(
  nodes: readonly NodeSchema[],
  input: string,
  context: Context,
  currentLevels: Grammar,
  nextLevels: Grammar,
  fullGrammar: Grammar,
  diag: Diagnostics
): ParseResult {
  for (const node of nodes) {
    const result = parseNodePattern(
      node,
      input,
      context,
      currentLevels,
      nextLevels,
      fullGrammar,
      diag
    );
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
 * Mirrors ParseLeftLevel/ParseLeftFold in src/parse/index.ts.
 */
function parseLeftLevel(
  levels: Grammar,
  input: string,
  context: Context,
  fullGrammar: Grammar,
  diag: Diagnostics
): ParseResult {
  const nodes = levels[0];
  const nextLevels = levels.slice(1);

  const seed = parseLevels(nextLevels, input, context, fullGrammar, diag);
  if (seed.length === 0) return [];

  let [left, rest] = seed;

  outer: for (;;) {
    for (const node of nodes) {
      const [lhsEl, ...tail] = node.pattern;

      // Check the folded-so-far node against the lhs constraint. Record
      // mismatches so schema typos surface in errors (the seed's start
      // offset is the operand's position).
      const constraint = resolveConstraintSpec(lhsEl, [], []);
      const leftOutput = (left as { outputSchema?: string }).outputSchema;
      if (!constraintAccepts(constraint, leftOutput)) {
        failConstraint(
          diag,
          input,
          rest,
          constraint.describe ?? "expression",
          leftOutput ?? "unknown",
          subjectOf(left)
        );
        continue;
      }

      // The tail's rhs elements parse at the NEXT level (currentLevels :=
      // nextLevels), which is what makes the fold left-associative. TAcc/
      // TDone are seeded with the left operand so sameAs("left") resolves.
      const tailResult = parsePatternTuple(
        tail,
        rest,
        context,
        nextLevels,
        nextLevels,
        fullGrammar,
        diag,
        [lhsEl],
        [left]
      );
      if (tailResult.length === 0) continue;

      // Defensive: a zero-width tail would loop forever (createParser
      // validation makes this unreachable)
      if (tailResult[1] === rest) continue;

      left = buildNodeResult(node, tailResult[0]);
      rest = tailResult[1];
      continue outer;
    }
    return [left, rest];
  }
}

/**
 * Parse using grammar levels (flat tuple).
 *
 * levels[0] is current level, levels[1:] is next levels.
 * Left-associative levels use the iterative fold.
 */
function parseLevels(
  levels: Grammar,
  input: string,
  context: Context,
  fullGrammar: Grammar,
  diag: Diagnostics
): ParseResult {
  if (levels.length === 0) {
    return [];
  }

  const currentNodes = levels[0];

  // A level is left-associative when its nodes declare associativity: "left".
  // createParser validates that a level never mixes associativities.
  if (currentNodes.length > 0 && currentNodes[0].associativity === "left") {
    return parseLeftLevel(levels, input, context, fullGrammar, diag);
  }

  const nextLevels = levels.slice(1);

  // Try nodes at current level
  const result = parseNodes(
    currentNodes,
    input,
    context,
    levels,
    nextLevels,
    fullGrammar,
    diag
  );

  if (result.length === 2) {
    return result;
  }

  // Fall through to next levels (if any)
  if (nextLevels.length > 0) {
    return parseLevels(nextLevels, input, context, fullGrammar, diag);
  }

  return [];
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Parse input string using node schemas.
 *
 * Returns the raw [node, rest] | [] result plus the diagnostics gathered
 * during parsing. Prefer parser.parse() / parser.safeParse() from
 * createParser for a friendlier API.
 */
export function parseWithDiagnostics(
  nodes: readonly NodeSchema[],
  input: string,
  context: Context
): { result: ParseResult; diagnostics: Diagnostics } {
  const grammar = buildGrammar(nodes);
  const diagnostics = createDiagnostics(input);
  const result = parseLevels(grammar, input, context, grammar, diagnostics);
  return { result, diagnostics };
}

/**
 * Parse input string using node schemas.
 *
 * The return type is computed from the input types using the type-level
 * Parse<Grammar, Input, Context> type, ensuring runtime and type-level
 * parsing stay in sync.
 */
export function parse<
  const TNodes extends readonly NodeSchema[],
  const TInput extends string,
  const TContext extends Context
>(
  nodes: TNodes,
  input: TInput,
  context: TContext
): Parse<ComputeGrammar<TNodes>, TInput, TContext> {
  return parseWithDiagnostics(nodes, input, context).result as Parse<
    ComputeGrammar<TNodes>,
    TInput,
    TContext
  >;
}
