/**
 * Runtime Evaluator
 *
 * Evaluates a parsed AST against a runtime values object. Post-order walk:
 * children are evaluated first, then the node's eval() function (from
 * defineNode) is applied to the evaluated bindings.
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
      segment in (current as object)
    ) {
      current = (current as Record<string, unknown>)[segment];
    } else {
      throw new EvaluationError(`'${path.join(".")}' is not defined`);
    }
  }
  return current;
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
      if (!(name in values)) {
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

      // Evaluate every AST-node field (the named bindings); pass other
      // fields through unchanged.
      const evaluated: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(node)) {
        if (key === "node" || key === "outputSchema") continue;
        evaluated[key] = isAstNode(value)
          ? evaluateAst(value, nodesByName, values)
          : value;
      }

      if (schema.eval === undefined) {
        throw new EvaluationError(
          `Node '${node.node}' has no eval function. Add one to its defineNode call, e.g. eval: ({ inner }) => inner`
        );
      }
      return schema.eval(evaluated, values);
    }
  }
}
