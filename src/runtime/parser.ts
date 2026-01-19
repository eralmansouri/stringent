/**
 * Runtime Parser
 *
 * Mirrors the type-level Parse<Grammar, Input, Context> at runtime.
 * Uses the same precedence-based parsing strategy:
 *   1. Try operators at current level (lowest precedence first)
 *   2. Fall back to next level (higher precedence)
 *   3. Base case: try atoms (last level)
 */

import { Token } from '@sinclair/parsebox';
import type { Context } from '../context.js';
import type { ComputeGrammar, Grammar } from '../grammar/index.js';
import type { Parse } from '../parse/index.js';
import type {
  NodeSchema,
  PatternSchema,
  StringSchema,
  ConstSchema,
  ExprSchema,
  UnionResultType,
} from '../schema/index.js';
import {
  defineNode,
  number,
  string,
  ident,
  constVal,
  expr,
  nullLiteral,
  booleanLiteral,
  undefinedLiteral,
} from '../schema/index.js';

import {
  ASTNode,
  IdentNode,
  NumberNode,
  StringNode,
  NullNode,
  BooleanNode,
  UndefinedNode,
} from '../primitive/index.js';

// =============================================================================
// Built-in Atoms
// =============================================================================

/**
 * Built-in atom schemas.
 * These are always appended as the last level of the grammar.
 * Users don't need to define these - they're provided automatically.
 */

/**
 * Precedence for built-in atoms.
 * Atoms are precedence 0 (base case), operators have precedence 1, 2, 3, etc.
 * Note: Atoms are appended separately, so this value isn't used in sorting.
 */
const ATOM_PRECEDENCE = 0;

/** Number literal atom - matches numeric literals */
const numberLiteral = defineNode({
  name: 'numberLiteral',
  pattern: [number()],
  precedence: ATOM_PRECEDENCE,
  resultType: 'number',
});

/** String literal atom - matches strings with " or ' quotes */
const stringLiteral = defineNode({
  name: 'stringLiteral',
  pattern: [string(['"', "'"])],
  precedence: ATOM_PRECEDENCE,
  resultType: 'string',
});

/** Identifier atom - matches identifiers */
const identifierAtom = defineNode({
  name: 'identifier',
  pattern: [ident()],
  precedence: ATOM_PRECEDENCE,
  resultType: 'unknown',
});

/** Parentheses atom - matches ( expr ) for grouping */
const parentheses = defineNode({
  name: 'parentheses',
  pattern: [constVal('('), expr().as('inner'), constVal(')')],
  precedence: ATOM_PRECEDENCE,
  resultType: 'unknown',
});

/** Null literal atom - matches the keyword null */
const nullAtom = defineNode({
  name: 'nullLiteral',
  pattern: [nullLiteral()],
  precedence: ATOM_PRECEDENCE,
  resultType: 'null',
});

/** Boolean literal atom - matches true or false */
const booleanAtom = defineNode({
  name: 'booleanLiteral',
  pattern: [booleanLiteral()],
  precedence: ATOM_PRECEDENCE,
  resultType: 'boolean',
});

/** Undefined literal atom - matches the keyword undefined */
const undefinedAtom = defineNode({
  name: 'undefinedLiteral',
  pattern: [undefinedLiteral()],
  precedence: ATOM_PRECEDENCE,
  resultType: 'undefined',
});

/** All built-in atoms, used as the last level of the grammar */
// Note: Keyword literals (null, true, false, undefined) must come BEFORE
// identifierAtom to ensure they're matched correctly rather than as identifiers
export const BUILT_IN_ATOMS = [
  numberLiteral,
  stringLiteral,
  nullAtom,
  booleanAtom,
  undefinedAtom,
  identifierAtom,
  parentheses,
] as const;

/** Parse result: empty = no match, [node, rest] = matched */
export type ParseResult<T extends ASTNode<string, unknown> = ASTNode<string, unknown>> =
  | []
  | [T & {}, string];

// =============================================================================
// Primitive Parsers
// =============================================================================

function parseNumber(input: string): ParseResult {
  const result = Token.Number(input) as [] | [string, string];
  if (result.length === 0) return [];
  return [
    {
      node: 'literal',
      raw: result[0],
      value: +result[0],
      outputSchema: 'number',
    } as NumberNode<(typeof result)[0]>,
    result[1],
  ];
}

/**
 * Process escape sequences in a string.
 * Supports: \n, \t, \r, \\, \", \', \0, \b, \f, \v, \xHH, \uHHHH
 *
 * @param str - The raw string with escape sequences
 * @returns The processed string with escape sequences converted
 */
export function processEscapeSequences(str: string): string {
  let result = '';
  let i = 0;
  while (i < str.length) {
    if (str[i] === '\\') {
      if (i + 1 >= str.length) {
        // Trailing backslash - keep as-is
        result += '\\';
        i++;
        continue;
      }
      const next = str[i + 1];
      switch (next) {
        case 'n':
          result += '\n';
          i += 2;
          break;
        case 't':
          result += '\t';
          i += 2;
          break;
        case 'r':
          result += '\r';
          i += 2;
          break;
        case '\\':
          result += '\\';
          i += 2;
          break;
        case '"':
          result += '"';
          i += 2;
          break;
        case "'":
          result += "'";
          i += 2;
          break;
        case '0':
          result += '\0';
          i += 2;
          break;
        case 'b':
          result += '\b';
          i += 2;
          break;
        case 'f':
          result += '\f';
          i += 2;
          break;
        case 'v':
          result += '\v';
          i += 2;
          break;
        case 'x': {
          // \xHH - two hex digits
          if (i + 3 < str.length) {
            const hex = str.slice(i + 2, i + 4);
            if (/^[0-9a-fA-F]{2}$/.test(hex)) {
              result += String.fromCharCode(parseInt(hex, 16));
              i += 4;
              break;
            }
          }
          // Invalid \x escape - keep as-is
          result += '\\x';
          i += 2;
          break;
        }
        case 'u': {
          // \uHHHH - four hex digits
          if (i + 5 < str.length) {
            const hex = str.slice(i + 2, i + 6);
            if (/^[0-9a-fA-F]{4}$/.test(hex)) {
              result += String.fromCharCode(parseInt(hex, 16));
              i += 6;
              break;
            }
          }
          // Invalid \u escape - keep as-is
          result += '\\u';
          i += 2;
          break;
        }
        default:
          // Unknown escape - keep backslash and character
          result += '\\' + next;
          i += 2;
          break;
      }
    } else {
      result += str[i];
      i++;
    }
  }
  return result;
}

/**
 * Parse a string literal with proper escape sequence handling.
 * Unlike Token.String, this parser correctly handles escaped quotes within strings.
 */
function parseStringLiteral(
  quotes: readonly string[],
  input: string
): [] | [rawContent: string, remaining: string] {
  // Trim leading whitespace
  const trimmed = input.replace(/^[\s]*/, '');
  if (trimmed.length === 0) return [];

  // Check for opening quote
  const openQuote = quotes.find((q) => trimmed.startsWith(q));
  if (!openQuote) return [];

  // Find closing quote, respecting escape sequences
  let i = openQuote.length;
  let rawContent = '';

  while (i < trimmed.length) {
    const char = trimmed[i];

    // Check for escape sequence
    if (char === '\\') {
      if (i + 1 < trimmed.length) {
        // Include both the backslash and the escaped character in raw content
        rawContent += char + trimmed[i + 1];
        i += 2;
        continue;
      } else {
        // Trailing backslash - include it
        rawContent += char;
        i++;
        continue;
      }
    }

    // Check for closing quote
    if (char === openQuote) {
      return [rawContent, trimmed.slice(i + openQuote.length)];
    }

    // Regular character
    rawContent += char;
    i++;
  }

  // Unterminated string
  return [];
}

function parseString(quotes: readonly string[], input: string): ParseResult {
  const result = parseStringLiteral(quotes, input);
  if (result.length === 0) return [];
  const rawValue = result[0];
  const processedValue = processEscapeSequences(rawValue);
  return [
    {
      node: 'literal',
      raw: rawValue,
      value: processedValue,
      outputSchema: 'string',
    } as StringNode<(typeof result)[0]>,
    result[1],
  ];
}

function parseIdent(input: string, context: Context): ParseResult {
  const result = Token.Ident(input) as [] | [string, string];
  if (result.length === 0) return [];
  const name = result[0];
  const valueType =
    name in context.data ? (context.data as Record<string, string>)[name] : 'unknown';
  return [
    { node: 'identifier', name, outputSchema: valueType } as IdentNode<
      typeof name,
      typeof valueType
    >,
    result[1],
  ];
}

function parseConst(value: string, input: string): ParseResult {
  const result = Token.Const(value, input) as [] | [string, string];
  if (result.length === 0) return [];
  return [{ node: 'const', outputSchema: JSON.stringify(value) }, result[1]];
}

function parseNull(input: string): ParseResult {
  const result = Token.Const('null', input) as [] | [string, string];
  if (result.length === 0) return [];
  // Ensure it's not part of a longer identifier (e.g., "nullable")
  const remaining = result[1];
  if (remaining.length > 0 && /^[a-zA-Z0-9_$]/.test(remaining)) {
    return [];
  }
  return [
    {
      node: 'literal',
      raw: 'null',
      value: null,
      outputSchema: 'null',
    } as NullNode,
    remaining,
  ];
}

function parseBoolean(input: string): ParseResult {
  // Try "true" first
  let result = Token.Const('true', input) as [] | [string, string];
  if (result.length === 2) {
    const remaining = result[1];
    // Ensure it's not part of a longer identifier (e.g., "trueName")
    if (remaining.length === 0 || !/^[a-zA-Z0-9_$]/.test(remaining)) {
      return [
        {
          node: 'literal',
          raw: 'true',
          value: true,
          outputSchema: 'boolean',
        } as BooleanNode<'true'>,
        remaining,
      ];
    }
  }

  // Try "false"
  result = Token.Const('false', input) as [] | [string, string];
  if (result.length === 2) {
    const remaining = result[1];
    // Ensure it's not part of a longer identifier (e.g., "falsePositive")
    if (remaining.length === 0 || !/^[a-zA-Z0-9_$]/.test(remaining)) {
      return [
        {
          node: 'literal',
          raw: 'false',
          value: false,
          outputSchema: 'boolean',
        } as BooleanNode<'false'>,
        remaining,
      ];
    }
  }

  return [];
}

function parseUndefined(input: string): ParseResult {
  const result = Token.Const('undefined', input) as [] | [string, string];
  if (result.length === 0) return [];
  // Ensure it's not part of a longer identifier (e.g., "undefinedVar")
  const remaining = result[1];
  if (remaining.length > 0 && /^[a-zA-Z0-9_$]/.test(remaining)) {
    return [];
  }
  return [
    {
      node: 'literal',
      raw: 'undefined',
      value: undefined,
      outputSchema: 'undefined',
    } as UndefinedNode,
    remaining,
  ];
}

// =============================================================================
// Build Runtime Grammar from Node Schemas
// =============================================================================

/**
 * Build runtime grammar from operator schemas.
 *
 * Returns a flat tuple of levels:
 *   [[ops@prec1], [ops@prec2], ..., [builtInAtoms]]
 *
 * Operators are sorted by precedence ascending (lowest first).
 * Built-in atoms are always appended as the last level.
 */
export function buildGrammar(operators: readonly NodeSchema[]): Grammar {
  const operatorsByPrec: Map<number, NodeSchema[]> = new Map();
  const operatorsAndPrimitives = [...operators];

  for (const op of operatorsAndPrimitives) {
    const prec = op.precedence;
    const ops = operatorsByPrec.get(prec) ?? [];
    operatorsByPrec.set(prec, ops);
    ops.push(op);
  }

  // Sort precedences ascending
  const precedences = [...operatorsByPrec.keys()].sort((a, b) => a - b);

  // Build flat grammar: [[ops@prec1], [ops@prec2], ..., [builtInAtoms]]
  const grammar: (readonly NodeSchema[])[] = [];
  for (const prec of precedences) {
    grammar.push(operatorsByPrec.get(prec) ?? []);
  }

  // Append built-in atoms as the last level
  grammar.push(BUILT_IN_ATOMS);
  return grammar;
}

// =============================================================================
// Pattern Element Parsing
// =============================================================================

/**
 * Parse a single pattern element (non-Expr).
 */
function parseElement(element: PatternSchema, input: string, context: Context): ParseResult {
  switch (element.kind) {
    case 'number':
      return parseNumber(input);
    case 'string':
      return parseString((element as StringSchema).quotes, input);
    case 'ident':
      return parseIdent(input, context);
    case 'const':
      return parseConst((element as ConstSchema).value, input);
    case 'null':
      return parseNull(input);
    case 'boolean':
      return parseBoolean(input);
    case 'undefined':
      return parseUndefined(input);
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
  fullGrammar: Grammar
): ParseResult {
  if (element.kind === 'expr') {
    const exprElement = element as ExprSchema;
    const constraint = exprElement.constraint;
    const role = exprElement.role;

    if (role === 'lhs') {
      return parseExprWithConstraint(nextLevels, input, context, constraint, fullGrammar);
    } else if (role === 'rhs') {
      return parseExprWithConstraint(currentLevels, input, context, constraint, fullGrammar);
    } else {
      return parseExprWithConstraint(fullGrammar, input, context, constraint, fullGrammar);
    }
  }
  return parseElement(element, input, context);
}

/**
 * Parse a pattern tuple.
 */
function parsePatternTuple(
  pattern: readonly PatternSchema[],
  input: string,
  context: Context,
  currentLevels: Grammar,
  nextLevels: Grammar,
  fullGrammar: Grammar
): [] | [ASTNode[], string] {
  let remaining = input;
  const children: ASTNode[] = [];

  for (const element of pattern) {
    const result = parseElementWithLevel(
      element,
      remaining,
      context,
      currentLevels,
      nextLevels,
      fullGrammar
    );
    if (result.length === 0) return [];
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
  children: ASTNode[]
): Record<string, ASTNode> {
  const bindings: Record<string, ASTNode> = {};

  for (let i = 0; i < pattern.length; i++) {
    const element = pattern[i];
    const child = children[i];

    // Check if element is a NamedSchema (has __named and name properties)
    if ('__named' in element && element.__named === true) {
      bindings[(element as { name: string }).name] = child;
    }
  }

  return bindings;
}

/**
 * Build AST node from parsed children.
 *
 * Uses named bindings from .as() to determine node fields.
 * - Single child without names: passthrough (atom behavior)
 * - If configure() provided: transform bindings to fields
 * - Otherwise: bindings become node fields directly
 *
 * Special case: If resultType is "unknown" and there's a single expr binding,
 * we propagate that binding's outputSchema (for generic parentheses, etc.).
 */
/**
 * Helper: Check if resultType is a UnionResultType (computed union).
 */
function isUnionResultType(resultType: string | UnionResultType): resultType is UnionResultType {
  return typeof resultType === 'object' && resultType !== null && 'union' in resultType;
}

/**
 * Helper: Compute the union outputSchema string from multiple bindings.
 * Given a list of binding names, extracts each binding's outputSchema and
 * constructs a union string like "boolean | number".
 *
 * @example
 * // bindings = { then: { outputSchema: 'boolean' }, else: { outputSchema: 'number' } }
 * // names = ['then', 'else']
 * // result = 'boolean | number'
 */
function computeUnionOutputSchema(
  bindings: Record<string, ASTNode>,
  names: readonly string[]
): string {
  const schemas: string[] = [];
  for (const name of names) {
    const binding = bindings[name] as { outputSchema?: string } | undefined;
    if (binding?.outputSchema && binding.outputSchema !== 'unknown') {
      // Only add unique schemas
      if (!schemas.includes(binding.outputSchema)) {
        schemas.push(binding.outputSchema);
      }
    }
  }
  if (schemas.length === 0) {
    return 'unknown';
  }
  if (schemas.length === 1) {
    return schemas[0];
  }
  // Sort for consistency and join with ' | '
  return schemas.sort().join(' | ');
}

function buildNodeResult(nodeSchema: NodeSchema, children: ASTNode[], context: Context): ASTNode {
  const bindings = extractBindings(nodeSchema.pattern, children);

  // Single unnamed child → passthrough (atom behavior)
  if (Object.keys(bindings).length === 0 && children.length === 1) {
    return children[0];
  }

  // Apply configure() if provided, otherwise use bindings directly
  const fields = nodeSchema.configure ? nodeSchema.configure(bindings, context) : bindings;

  // Determine output schema:
  // - If resultType is a UnionResultType, compute the union from the specified bindings
  // - If resultType is "unknown" and there's a single expr binding, use its outputSchema
  // - Otherwise use the node's static resultType
  let outputSchema: string;

  if (isUnionResultType(nodeSchema.resultType)) {
    // Computed union: extract schemas from named bindings and join with ' | '
    outputSchema = computeUnionOutputSchema(bindings, nodeSchema.resultType.union);
  } else {
    outputSchema = nodeSchema.resultType;
    if (outputSchema === 'unknown') {
      const bindingKeys = Object.keys(bindings);
      if (bindingKeys.length === 1) {
        const singleBinding = bindings[bindingKeys[0]] as {
          outputSchema?: string;
        };
        if (singleBinding.outputSchema) {
          outputSchema = singleBinding.outputSchema;
        }
      }
    }
  }

  // Build node with fields
  return {
    node: nodeSchema.name,
    outputSchema,
    ...fields,
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
  fullGrammar: Grammar
): ParseResult {
  const result = parsePatternTuple(
    node.pattern,
    input,
    context,
    currentLevels,
    nextLevels,
    fullGrammar
  );
  if (result.length === 0) return [];
  return [buildNodeResult(node, result[0], context), result[1]];
}

/**
 * Parse with expression constraint check.
 */
function parseExprWithConstraint(
  startLevels: Grammar,
  input: string,
  context: Context,
  constraint: string | undefined,
  fullGrammar: Grammar
): ParseResult {
  const result = parseLevels(startLevels, input, context, fullGrammar);
  if (result.length === 0) return [];

  const [node, remaining] = result;

  if (constraint !== undefined) {
    const nodeOutputSchema = (node as { outputSchema?: string }).outputSchema;
    if (nodeOutputSchema !== constraint) {
      return [];
    }
  }

  return [node, remaining];
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
  fullGrammar: Grammar
): ParseResult {
  for (const node of nodes) {
    const result = parseNodePattern(node, input, context, currentLevels, nextLevels, fullGrammar);
    if (result.length === 2) return result;
  }
  return [];
}

/**
 * Parse using grammar levels (flat tuple).
 *
 * levels[0] is current level, levels[1:] is next levels.
 * Base case: single level (atoms) - just try those nodes.
 */
function parseLevels(
  levels: Grammar,
  input: string,
  context: Context,
  fullGrammar: Grammar
): ParseResult {
  if (levels.length === 0) {
    return [];
  }

  const currentNodes = levels[0];
  const nextLevels = levels.slice(1);

  // Try nodes at current level
  const result = parseNodes(currentNodes, input, context, levels, nextLevels, fullGrammar);

  if (result.length === 2) {
    return result;
  }

  // Fall through to next levels (if any)
  if (nextLevels.length > 0) {
    return parseLevels(nextLevels, input, context, fullGrammar);
  }

  return [];
}

// =============================================================================
// Public API
// =============================================================================

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
  const TContext extends Context,
>(
  nodes: TNodes,
  input: TInput,
  context: TContext
): Parse<ComputeGrammar<TNodes>, TInput, TContext> {
  const grammar = buildGrammar(nodes);
  return parseLevels(grammar, input, context, grammar) as Parse<
    ComputeGrammar<TNodes>,
    TInput,
    TContext
  >;
}

// =============================================================================
// Enhanced Parse API with Error Information
// =============================================================================

import {
  type RichParseError,
  type ParseResultWithErrors,
  noMatchError,
  emptyInputError,
} from '../errors.js';

export type { RichParseError, ParseResultWithErrors };

/**
 * Result from parseWithErrors - includes rich error information on failure.
 */
export interface ParseWithErrorsResult<
  T extends ASTNode<string, unknown> = ASTNode<string, unknown>,
> {
  /** Whether parsing was successful */
  readonly success: boolean;
  /** The parsed AST node (only present if success is true) */
  readonly ast?: T;
  /** Remaining unparsed input (only present if success is true) */
  readonly remaining?: string;
  /** Parse error information (only present if success is false) */
  readonly error?: RichParseError;
  /** Original input string */
  readonly input: string;
}

/**
 * Parse input with rich error information.
 *
 * Unlike `parse()` which returns an empty array on failure, this function
 * returns detailed error information including:
 * - Position (line, column, offset)
 * - Error message
 * - Source snippet showing where the error occurred
 *
 * @example
 * ```ts
 * const result = parseWithErrors([add], "1 + ", context);
 * if (!result.success) {
 *   console.log(result.error.message);
 *   // "No grammar rule matched at position 1:5: """
 *   console.log(result.error.snippet);
 *   // "1 + →"
 * }
 * ```
 */
export function parseWithErrors<
  const TNodes extends readonly NodeSchema[],
  const TInput extends string,
  const TContext extends Context,
>(nodes: TNodes, input: TInput, context: TContext): ParseWithErrorsResult {
  // Handle empty/whitespace-only input
  if (input.trim().length === 0) {
    return {
      success: false,
      error: emptyInputError(input),
      input,
    };
  }

  const grammar = buildGrammar(nodes);
  const result = parseLevels(grammar, input, context, grammar);

  if (result.length === 0) {
    // Parse failed - determine where it failed
    // Try to find how far we got before failing
    const failOffset = findFailureOffset(grammar, input, context);
    return {
      success: false,
      error: noMatchError(input, failOffset),
      input,
    };
  }

  // Parse succeeded
  return {
    success: true,
    ast: result[0],
    remaining: result[1],
    input,
  };
}

/**
 * Find the offset where parsing failed by tracking the furthest successful parse.
 * This helps provide more accurate error positions.
 */
function findFailureOffset(grammar: Grammar, input: string, context: Context): number {
  // Start by trimming leading whitespace since the parser does this
  const trimmed = input.replace(/^[\s]*/, '');
  const leadingWs = input.length - trimmed.length;

  if (trimmed.length === 0) {
    return 0;
  }

  // Try to parse and track how far we get
  // This is a simplified heuristic - in a more complex implementation,
  // we would thread position tracking through all parse functions
  let furthestOffset = leadingWs;

  // Try to parse the first atom/expression
  const result = parseLevels(grammar, trimmed, context, grammar);
  if (result.length === 2) {
    // We parsed something - the failure is after what we parsed
    const parsedLength = trimmed.length - result[1].length;
    furthestOffset = leadingWs + parsedLength;

    // Check if there's unparsed content
    const remaining = result[1].trim();
    if (remaining.length > 0) {
      // There's remaining unparsed content - that's where the error is
      furthestOffset = input.length - result[1].trimStart().length;
    }
  }

  return furthestOffset;
}

/**
 * Format a parse error for display.
 *
 * @example
 * ```ts
 * const result = parseWithErrors([add], "1 + ", context);
 * if (!result.success) {
 *   console.log(formatParseError(result.error));
 *   // Error at line 1, column 5:
 *   //   No grammar rule matched at position 1:5: ""
 *   //
 *   //   1 + →
 * }
 * ```
 */
export function formatParseError(error: RichParseError): string {
  const { position, message, snippet } = error;
  const lines: string[] = [];

  lines.push(`Error at line ${position.line}, column ${position.column}:`);
  lines.push(`  ${message}`);
  lines.push('');
  lines.push(`  ${snippet}`);

  if (error.context) {
    const ctx = error.context;
    if (ctx.expected && ctx.actual) {
      lines.push('');
      lines.push(`  Expected: ${ctx.expected}`);
      lines.push(`  Actual:   ${ctx.actual}`);
    }
  }

  return lines.join('\n');
}
