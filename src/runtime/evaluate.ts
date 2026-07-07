/**
 * Runtime Evaluator
 *
 * Evaluates a parsed AST against a runtime values object. Post-order walk:
 * the node's eval() function (from defineNode) is applied to its bindings.
 *
 * Evaluation is uniformly LAZY: eval receives each binding as a memoized
 * thunk (() => value), so short-circuit semantics (ternary, &&, ||) hold
 * for every node without opt-in, and each child is evaluated at most once
 * (pinned in design-claims.test.ts "evaluation model").
 *
 * Security: all identifier/path lookups use own-property checks only —
 * expressions like `__proto__` or `x.constructor` never traverse the
 * prototype chain.
 */

import type { NodeSchema } from "../schema/index.js";

/** Error thrown when an AST cannot be evaluated */
export class EvaluationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvaluationError";
  }
}

/** Values object: maps identifier names (possibly nested) to runtime values */
export type EvaluationValues = Record<string, unknown>;

/**
 * Node names produced directly by the parser's primitive elements. User
 * nodes must not reuse them (the evaluator dispatches on node names) —
 * createParser rejects grammars that try.
 */
export const RESERVED_NODE_NAMES = new Set([
  "literal",
  "identifier",
  "path",
  "const",
]);

function isAstNode(value: unknown): value is { node: string; outputSchema: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { node?: unknown }).node === "string" &&
    "outputSchema" in value
  );
}

function lookupPath(values: EvaluationValues, path: readonly string[]): unknown {
  let current: unknown = values;
  for (const segment of path) {
    if (
      current !== null &&
      typeof current === "object" &&
      Object.hasOwn(current, segment)
    ) {
      current = (current as Record<string, unknown>)[segment];
    } else {
      throw new EvaluationError(`'${path.join(".")}' is not defined`);
    }
  }
  return current;
}

/** Memoize a thunk so eval functions can call bindings repeatedly */
function once<T>(compute: () => T): () => T {
  let done = false;
  let value: T;
  return () => {
    if (!done) {
      value = compute();
      done = true;
    }
    return value;
  };
}

/**
 * Evaluate a parsed AST node.
 *
 * @param ast - The parsed AST node (from parse/safeParse)
 * @param nodesByName - Node schemas indexed by name (for eval lookup)
 * @param values - Runtime values for identifiers/paths in the expression
 * @returns The evaluated value
 */
export function evaluateAst(
  ast: unknown,
  nodesByName: ReadonlyMap<string, NodeSchema>,
  values: EvaluationValues
): unknown {
  if (!isAstNode(ast)) {
    throw new EvaluationError(`Cannot evaluate non-AST value: ${JSON.stringify(ast)}`);
  }

  const node = ast as Record<string, unknown> & { node: string };

  switch (node.node) {
    case "literal":
      return node.value;

    case "identifier": {
      const name = node.name as string;
      if (!Object.hasOwn(values, name)) {
        throw new EvaluationError(`'${name}' is not defined`);
      }
      return values[name];
    }

    case "path":
      return lookupPath(values, node.path as readonly string[]);

    case "const":
      return node.outputSchema; // the matched text

    default: {
      const schema = nodesByName.get(node.node);
      if (schema === undefined) {
        throw new EvaluationError(
          `Unknown node type '${node.node}' — was this AST produced by this parser?`
        );
      }

      if (schema.eval === undefined) {
        throw new EvaluationError(
          `Node '${node.node}' has no eval function. Add one to its defineNode call, e.g. eval: ({ inner }) => inner()`
        );
      }

      // Every AST-node field (the named bindings) becomes a memoized thunk;
      // other fields are thunked as-is so eval sees one uniform shape.
      const bindings: Record<string, () => unknown> = {};
      for (const [key, value] of Object.entries(node)) {
        if (key === "node" || key === "outputSchema") continue;
        bindings[key] = once(() =>
          isAstNode(value) ? evaluateAst(value, nodesByName, values) : value
        );
      }

      return schema.eval(bindings);
    }
  }
}
