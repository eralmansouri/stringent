/**
 * Runtime Evaluator
 *
 * Evaluates a parsed AST against a runtime values object. Post-order walk:
 * children are evaluated first, then the node's eval() function (from
 * defineNode) is applied to the evaluated bindings.
 *
 * Nodes with lazy: true receive memoized THUNKS instead of values, enabling
 * short-circuit semantics (ternary, &&, ||).
 *
 * Security: all identifier/path lookups use own-property checks only —
 * expressions like `__proto__` or `x.constructor` never traverse the
 * prototype chain.
 */

import type { NodeSchema } from "../schema/index.js";
import { outputTypeOf } from "./types.js";

/** Error thrown when an AST cannot be evaluated */
export class EvaluationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvaluationError";
  }
}

/** Values object: maps identifier names (possibly nested) to runtime values */
export type EvaluationValues = Record<string, unknown>;

/** Evaluation behavior switches (threaded through the recursive walk) */
export interface EvaluateOptions {
  /**
   * Assert each user node's eval output against the node's resolved result
   * type (via the parsed Type riding on the AST). Catches evals that return
   * the wrong shape — the runtime complement of the compile-time EvalReturn
   * check, for plain-JS users. Skipped for ASTs without attached Types
   * (e.g. deserialized ones). Enabled by createParser's dev mode.
   */
  readonly assertResults?: boolean;
}

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

/** Memoize a thunk so lazy eval functions can call bindings repeatedly */
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
 * @param options - Behavior switches (dev-mode result assertions)
 * @returns The evaluated value
 */
export function evaluateAst(
  ast: unknown,
  nodesByName: ReadonlyMap<string, NodeSchema>,
  values: EvaluationValues,
  options?: EvaluateOptions
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
          `Node '${node.node}' has no eval function. Add one to its defineNode call, e.g. eval: ({ inner }) => inner`
        );
      }

      // Evaluate every AST-node field (the named bindings); pass other
      // fields through unchanged. Lazy nodes get memoized thunks instead.
      const evaluated: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(node)) {
        if (key === "node" || key === "outputSchema") continue;
        if (schema.lazy === true) {
          evaluated[key] = once(() =>
            isAstNode(value)
              ? evaluateAst(value, nodesByName, values, options)
              : value
          );
        } else {
          evaluated[key] = isAstNode(value)
            ? evaluateAst(value, nodesByName, values, options)
            : value;
        }
      }

      const result = schema.eval(evaluated, values);

      if (options?.assertResults === true) {
        const expected = outputTypeOf(node);
        if (expected !== undefined && !expected.allows(result)) {
          // describe the actual by SHAPE only — evaluated values may be
          // secrets and must not leak into error messages
          const actual =
            result === null
              ? "null"
              : result === undefined
              ? "undefined"
              : Array.isArray(result)
              ? "an array"
              : typeof result === "object"
              ? "an object"
              : `a ${typeof result}`;
          throw new EvaluationError(
            `eval for node '${node.node}' returned ${actual}, which does not satisfy the node's result type '${expected.expression}'`
          );
        }
      }

      return result;
    }
  }
}
