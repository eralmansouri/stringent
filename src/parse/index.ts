/**
 * Parse Type - Type-Level Parsing with Grammar Support
 *
 * Parse<Grammar, Input, Context> computes the exact result type of parsing
 * an input string against a grammar.
 *
 * The grammar is a flat tuple of precedence levels:
 *   [[Level0Ops], [Level1Ops], ..., [Atoms]]
 *
 * Parsing proceeds:
 * 1. Try operators at current level (index 0, lowest precedence)
 * 2. Fall back to next level (index 1, higher precedence)
 * 3. Continue until atoms (last element)
 */

import type { Token } from '@sinclair/parsebox';
import type { Context } from '../context.js';
import type { Grammar } from '../grammar/index.js';
import type {
  NodeSchema,
  PatternSchema,
  PatternSchemaBase,
  NamedSchema,
  NumberSchema,
  StringSchema,
  IdentSchema,
  ConstSchema,
  NullSchema,
  BooleanSchema,
  UndefinedSchema,
  UnionResultType,
} from '../schema/index.js';
import type {
  NumberNode,
  StringNode,
  IdentNode,
  ConstNode,
  NullNode,
  BooleanNode,
  UndefinedNode,
} from '../primitive/index.js';

// =============================================================================
// Error Types
// =============================================================================

/** Base parse error */
export interface ParseError<TMessage extends string = string> {
  readonly __error: true;
  readonly message: TMessage;
}

/** Type mismatch error (expression has wrong type) */
export type TypeMismatchError<
  TExpected extends string,
  TActual extends string,
> = ParseError<`Type mismatch: expected ${TExpected}, got ${TActual}`>;

/** No match error (no grammar rule matched) */
export type NoMatchError = ParseError<'No grammar rule matched'>;

// =============================================================================
// AST Node Types
// =============================================================================

/** Binary operator node */
export interface BinaryNode<
  TName extends string = string,
  TLeft = unknown,
  TRight = unknown,
  TOutputSchema extends string = string,
> {
  readonly node: TName;
  readonly outputSchema: TOutputSchema;
  readonly left: TLeft;
  readonly right: TRight;
}

// =============================================================================
// Primitive Parse Types (from Token API)
// =============================================================================

type ParseNumberPrimitive<TInput extends string> =
  Token.TNumber<TInput> extends [infer V extends string, infer R extends string]
    ? [NumberNode<V>, R]
    : [];

type ParseStringPrimitive<TQuotes extends readonly string[], TInput extends string> =
  Token.TString<[...TQuotes], TInput> extends [infer V extends string, infer R extends string]
    ? [StringNode<V>, R]
    : [];

type ParseIdentPrimitive<TInput extends string, TContext extends Context> =
  Token.TIdent<TInput> extends [infer V extends string, infer R extends string]
    ? V extends keyof TContext['data']
      ? [IdentNode<V, TContext['data'][V] & string>, R]
      : [IdentNode<V, 'unknown'>, R]
    : [];

type ParseConstPrimitive<TValue extends string, TInput extends string> =
  Token.TConst<TValue, TInput> extends [infer _V extends string, infer R extends string]
    ? [ConstNode<TValue>, R]
    : [];

/**
 * Parse null literal - matches "null" keyword followed by non-identifier char.
 */
type ParseNullPrimitive<TInput extends string> =
  Token.TConst<'null', TInput> extends [string, infer R extends string]
    ? R extends `${infer C}${string}`
      ? C extends
          | 'a'
          | 'b'
          | 'c'
          | 'd'
          | 'e'
          | 'f'
          | 'g'
          | 'h'
          | 'i'
          | 'j'
          | 'k'
          | 'l'
          | 'm'
          | 'n'
          | 'o'
          | 'p'
          | 'q'
          | 'r'
          | 's'
          | 't'
          | 'u'
          | 'v'
          | 'w'
          | 'x'
          | 'y'
          | 'z'
          | 'A'
          | 'B'
          | 'C'
          | 'D'
          | 'E'
          | 'F'
          | 'G'
          | 'H'
          | 'I'
          | 'J'
          | 'K'
          | 'L'
          | 'M'
          | 'N'
          | 'O'
          | 'P'
          | 'Q'
          | 'R'
          | 'S'
          | 'T'
          | 'U'
          | 'V'
          | 'W'
          | 'X'
          | 'Y'
          | 'Z'
          | '0'
          | '1'
          | '2'
          | '3'
          | '4'
          | '5'
          | '6'
          | '7'
          | '8'
          | '9'
          | '_'
          | '$'
        ? [] // Part of a longer identifier
        : [NullNode, R]
      : [NullNode, R] // End of input
    : [];

/**
 * Parse boolean literal - matches "true" or "false" keywords followed by non-identifier char.
 */
type ParseBooleanPrimitive<TInput extends string> =
  Token.TConst<'true', TInput> extends [string, infer R extends string]
    ? R extends `${infer C}${string}`
      ? C extends
          | 'a'
          | 'b'
          | 'c'
          | 'd'
          | 'e'
          | 'f'
          | 'g'
          | 'h'
          | 'i'
          | 'j'
          | 'k'
          | 'l'
          | 'm'
          | 'n'
          | 'o'
          | 'p'
          | 'q'
          | 'r'
          | 's'
          | 't'
          | 'u'
          | 'v'
          | 'w'
          | 'x'
          | 'y'
          | 'z'
          | 'A'
          | 'B'
          | 'C'
          | 'D'
          | 'E'
          | 'F'
          | 'G'
          | 'H'
          | 'I'
          | 'J'
          | 'K'
          | 'L'
          | 'M'
          | 'N'
          | 'O'
          | 'P'
          | 'Q'
          | 'R'
          | 'S'
          | 'T'
          | 'U'
          | 'V'
          | 'W'
          | 'X'
          | 'Y'
          | 'Z'
          | '0'
          | '1'
          | '2'
          | '3'
          | '4'
          | '5'
          | '6'
          | '7'
          | '8'
          | '9'
          | '_'
          | '$'
        ? ParseBooleanFalse<TInput> // Check if "false" matches instead
        : [BooleanNode<'true'>, R]
      : [BooleanNode<'true'>, R]
    : ParseBooleanFalse<TInput>;

type ParseBooleanFalse<TInput extends string> =
  Token.TConst<'false', TInput> extends [string, infer R extends string]
    ? R extends `${infer C}${string}`
      ? C extends
          | 'a'
          | 'b'
          | 'c'
          | 'd'
          | 'e'
          | 'f'
          | 'g'
          | 'h'
          | 'i'
          | 'j'
          | 'k'
          | 'l'
          | 'm'
          | 'n'
          | 'o'
          | 'p'
          | 'q'
          | 'r'
          | 's'
          | 't'
          | 'u'
          | 'v'
          | 'w'
          | 'x'
          | 'y'
          | 'z'
          | 'A'
          | 'B'
          | 'C'
          | 'D'
          | 'E'
          | 'F'
          | 'G'
          | 'H'
          | 'I'
          | 'J'
          | 'K'
          | 'L'
          | 'M'
          | 'N'
          | 'O'
          | 'P'
          | 'Q'
          | 'R'
          | 'S'
          | 'T'
          | 'U'
          | 'V'
          | 'W'
          | 'X'
          | 'Y'
          | 'Z'
          | '0'
          | '1'
          | '2'
          | '3'
          | '4'
          | '5'
          | '6'
          | '7'
          | '8'
          | '9'
          | '_'
          | '$'
        ? [] // Part of a longer identifier
        : [BooleanNode<'false'>, R]
      : [BooleanNode<'false'>, R]
    : [];

/**
 * Parse undefined literal - matches "undefined" keyword followed by non-identifier char.
 */
type ParseUndefinedPrimitive<TInput extends string> =
  Token.TConst<'undefined', TInput> extends [string, infer R extends string]
    ? R extends `${infer C}${string}`
      ? C extends
          | 'a'
          | 'b'
          | 'c'
          | 'd'
          | 'e'
          | 'f'
          | 'g'
          | 'h'
          | 'i'
          | 'j'
          | 'k'
          | 'l'
          | 'm'
          | 'n'
          | 'o'
          | 'p'
          | 'q'
          | 'r'
          | 's'
          | 't'
          | 'u'
          | 'v'
          | 'w'
          | 'x'
          | 'y'
          | 'z'
          | 'A'
          | 'B'
          | 'C'
          | 'D'
          | 'E'
          | 'F'
          | 'G'
          | 'H'
          | 'I'
          | 'J'
          | 'K'
          | 'L'
          | 'M'
          | 'N'
          | 'O'
          | 'P'
          | 'Q'
          | 'R'
          | 'S'
          | 'T'
          | 'U'
          | 'V'
          | 'W'
          | 'X'
          | 'Y'
          | 'Z'
          | '0'
          | '1'
          | '2'
          | '3'
          | '4'
          | '5'
          | '6'
          | '7'
          | '8'
          | '9'
          | '_'
          | '$'
        ? [] // Part of a longer identifier
        : [UndefinedNode, R]
      : [UndefinedNode, R] // End of input
    : [];

// =============================================================================
// Pattern Element Parsing
// =============================================================================

/**
 * Parse a single pattern element (non-Expr).
 * Works with both plain schemas and NamedSchema (intersection type).
 */
type ParseElement<
  TElement extends PatternSchema,
  TInput extends string,
  TContext extends Context,
> = TElement extends NumberSchema
  ? ParseNumberPrimitive<TInput>
  : TElement extends StringSchema<infer Q>
    ? ParseStringPrimitive<Q, TInput>
    : TElement extends IdentSchema
      ? ParseIdentPrimitive<TInput, TContext>
      : TElement extends ConstSchema<infer V>
        ? ParseConstPrimitive<V, TInput>
        : TElement extends NullSchema
          ? ParseNullPrimitive<TInput>
          : TElement extends BooleanSchema
            ? ParseBooleanPrimitive<TInput>
            : TElement extends UndefinedSchema
              ? ParseUndefinedPrimitive<TInput>
              : never; // ExprSchema is handled by ParseElementWithLevel

/**
 * Parse a tuple of pattern elements.
 *
 * TCurrentLevels - grammar from current level onward (for rhs)
 * TNextLevels - grammar from next level onward (for lhs, avoids left-recursion)
 * TFullGrammar - complete grammar (for expr role, full reset)
 */
type ParsePatternTuple<
  TPattern extends readonly PatternSchema[],
  TInput extends string,
  TContext extends Context,
  TCurrentLevels extends Grammar,
  TNextLevels extends Grammar,
  TFullGrammar extends Grammar,
  TAcc extends unknown[] = [],
> = TPattern extends readonly [
  infer First extends PatternSchema,
  ...infer Rest extends readonly PatternSchema[],
]
  ? ParseElementWithLevel<
      First,
      TInput,
      TContext,
      TCurrentLevels,
      TNextLevels,
      TFullGrammar
    > extends [infer R, infer Remaining extends string]
    ? ParsePatternTuple<
        Rest,
        Remaining,
        TContext,
        TCurrentLevels,
        TNextLevels,
        TFullGrammar,
        [...TAcc, R]
      >
    : []
  : [TAcc, TInput];

/**
 * Extract constraint from an ExprSchema by accessing the property directly.
 * The constraint property is optional, so we exclude undefined from the result.
 * Returns the constraint string type, or undefined if not constrained.
 */
type ExtractConstraint<T> = T extends { constraint: infer C extends string } ? C : undefined;

/**
 * Parse an expression element based on its role.
 * Works with both plain schemas and NamedSchema (intersection type).
 *
 * Role determines which grammar slice is used:
 * - "lhs": TNextLevels (avoids left-recursion)
 * - "rhs": TCurrentLevels (maintains precedence, enables right-associativity)
 * - "expr": TFullGrammar (full reset for delimited contexts)
 *
 * Uses structural matching on `kind: "expr"` and `role` property to handle
 * both plain ExprSchema and NamedSchema<ExprSchema, ...> intersection types.
 */
type ParseElementWithLevel<
  TElement extends PatternSchema,
  TInput extends string,
  TContext extends Context,
  TCurrentLevels extends Grammar,
  TNextLevels extends Grammar,
  TFullGrammar extends Grammar,
> = TElement extends { kind: 'expr'; role: infer Role }
  ? Role extends 'lhs'
    ? ParseExprWithConstraint<
        TNextLevels,
        TInput,
        TContext,
        ExtractConstraint<TElement>,
        TFullGrammar
      >
    : Role extends 'rhs'
      ? ParseExprWithConstraint<
          TCurrentLevels,
          TInput,
          TContext,
          ExtractConstraint<TElement>,
          TFullGrammar
        >
      : ParseExprWithConstraint<
          TFullGrammar,
          TInput,
          TContext,
          ExtractConstraint<TElement>,
          TFullGrammar
        >
  : ParseElement<TElement, TInput, TContext>;

// =============================================================================
// Node Pattern Parsing
// =============================================================================

/**
 * Parse a node's pattern and build the result node.
 */
type ParseNodePattern<
  TNode extends NodeSchema,
  TInput extends string,
  TContext extends Context,
  TCurrentLevels extends Grammar,
  TNextLevels extends Grammar,
  TFullGrammar extends Grammar,
> =
  ParsePatternTuple<
    TNode['pattern'],
    TInput,
    TContext,
    TCurrentLevels,
    TNextLevels,
    TFullGrammar
  > extends [infer Children extends unknown[], infer Rest extends string]
    ? [BuildNodeResult<TNode, Children>, Rest]
    : [];

/**
 * Extract bindings from pattern and children (recursive zip).
 * Only includes children where the pattern element is a NamedSchema.
 */
type ExtractBindings<
  TPattern extends readonly PatternSchema[],
  TChildren extends unknown[],
  TAcc extends {} = {},
> = TPattern extends readonly [
  infer First extends PatternSchema,
  ...infer RestPattern extends readonly PatternSchema[],
]
  ? TChildren extends [infer Child, ...infer RestChildren]
    ? First extends NamedSchema<PatternSchemaBase, infer Name>
      ? ExtractBindings<
          RestPattern,
          RestChildren,
          {
            [P in keyof TAcc | Name]: P extends Name
              ? Child
              : P extends keyof TAcc
                ? TAcc[P]
                : never;
          }
        >
      : ExtractBindings<RestPattern, RestChildren, TAcc>
    : TAcc
  : TAcc;

/**
 * Helper: Check if type has exactly one key.
 */
type HasExactlyOneKey<T> = keyof T extends infer K
  ? K extends unknown
    ? [K] extends [keyof T]
      ? keyof T extends K
        ? true
        : false
      : false
    : false
  : false;

/**
 * Helper: Get the single key from a type with exactly one key.
 */
type SingleKey<T> = keyof T extends infer K
  ? K extends keyof T
    ? keyof T extends K
      ? K
      : never
    : never
  : never;

/**
 * Helper: Extract outputSchema from the single binding.
 * If there's exactly one binding and it has an outputSchema, return it.
 * Otherwise return 'unknown'.
 */
type SingleBindingOutputSchema<Bindings> =
  HasExactlyOneKey<Bindings> extends true
    ? SingleKey<Bindings> extends infer K
      ? K extends keyof Bindings
        ? Bindings[K] extends { outputSchema: infer S extends string }
          ? S
          : 'unknown'
        : 'unknown'
      : 'unknown'
    : 'unknown';

/**
 * Helper: Extract outputSchema from a binding by name.
 * Returns the outputSchema if the binding exists and has one, otherwise 'unknown'.
 */
type BindingOutputSchema<Bindings, TName extends string> = TName extends keyof Bindings
  ? Bindings[TName] extends { outputSchema: infer S extends string }
    ? S
    : 'unknown'
  : 'unknown';

/**
 * Helper: Compute the union outputSchema string from multiple bindings.
 * Given a tuple of binding names, extracts each binding's outputSchema and
 * constructs a union string like "type1 | type2".
 *
 * @example
 * // Bindings = { then: { outputSchema: 'boolean' }, else: { outputSchema: 'number' } }
 * // Names = ['then', 'else']
 * // Result = 'boolean | number'
 */
type ComputeUnionOutputSchema<
  Bindings,
  TNames extends readonly string[],
  TAcc extends string = never,
> = TNames extends readonly [infer First extends string, ...infer Rest extends readonly string[]]
  ? BindingOutputSchema<Bindings, First> extends infer S extends string
    ? ComputeUnionOutputSchema<Bindings, Rest, TAcc | S>
    : ComputeUnionOutputSchema<Bindings, Rest, TAcc>
  : [TAcc] extends [never]
    ? 'unknown'
    : TAcc;

/**
 * Helper: Compute the effective outputSchema.
 * - If resultType is a UnionResultType, compute the union from the specified bindings
 * - If resultType is 'unknown' and there's exactly one binding with an outputSchema,
 *   propagate that binding's outputSchema (matches runtime behavior).
 * - Otherwise use the static resultType.
 */
type ComputeOutputSchema<TResultType extends string | UnionResultType, Bindings> =
  TResultType extends UnionResultType<infer TNames extends readonly string[]>
    ? ComputeUnionOutputSchema<Bindings, TNames>
    : TResultType extends 'unknown'
      ? SingleBindingOutputSchema<Bindings> extends infer S extends string
        ? S extends 'unknown'
          ? 'unknown'
          : S
        : 'unknown'
      : TResultType;

/**
 * Build the result node from parsed children.
 *
 * Uses named bindings from .as() to determine node fields.
 * - Single unnamed child: passthrough (atom behavior)
 * - Otherwise: bindings become node fields
 *
 * For nodes with resultType 'unknown' and exactly one binding,
 * the outputSchema is propagated from the binding (matches runtime).
 */
type BuildNodeResult<TNode extends NodeSchema, TChildren extends unknown[]> =
  ExtractBindings<TNode['pattern'], TChildren> extends infer Bindings
    ? keyof Bindings extends never
      ? TChildren extends [infer Only]
        ? Only // Single unnamed element - passthrough (atom)
        : never // Multiple unnamed children - error
      : {
          readonly node: TNode['name'];
          readonly outputSchema: ComputeOutputSchema<TNode['resultType'], Bindings>;
        } & Bindings
    : never;

// =============================================================================
// Expression Parsing with Constraint
// =============================================================================

/**
 * Parse an expression with optional type constraint.
 */
type ParseExprWithConstraint<
  TStartLevels extends Grammar,
  TInput extends string,
  TContext extends Context,
  TConstraint extends string | undefined,
  TFullGrammar extends Grammar,
> =
  ParseLevels<TStartLevels, TInput, TContext, TFullGrammar> extends [
    infer Node extends { outputSchema: string },
    infer Rest extends string,
  ]
    ? TConstraint extends string
      ? Node['outputSchema'] extends TConstraint
        ? [Node, Rest]
        : [] // Type mismatch - backtrack
      : [Node, Rest]
    : [];

// =============================================================================
// Level Parsing
// =============================================================================

/**
 * Try parsing each node in a level.
 */
type ParseNodes<
  TNodes extends readonly NodeSchema[],
  TInput extends string,
  TContext extends Context,
  TCurrentLevels extends Grammar,
  TNextLevels extends Grammar,
  TFullGrammar extends Grammar,
> = TNodes extends readonly [
  infer First extends NodeSchema,
  ...infer Rest extends readonly NodeSchema[],
]
  ? ParseNodePattern<First, TInput, TContext, TCurrentLevels, TNextLevels, TFullGrammar> extends [
      infer R,
      infer Remaining extends string,
    ]
    ? [R, Remaining]
    : ParseNodes<Rest, TInput, TContext, TCurrentLevels, TNextLevels, TFullGrammar>
  : [];

/**
 * Parse using grammar levels (flat tuple).
 *
 * TLevels is the remaining levels to try, starting from current.
 * - Try nodes at first level (TLevels[0])
 * - If no match, fall back to rest of levels
 * - Base case: single level (atoms) - just try those nodes
 */
type ParseLevels<
  TLevels extends Grammar,
  TInput extends string,
  TContext extends Context,
  TFullGrammar extends Grammar,
> = TLevels extends readonly [
  infer CurrentNodes extends readonly NodeSchema[],
  ...infer NextNodes extends Grammar,
]
  ? // Multiple levels remaining - try current, fallback to rest
    ParseNodes<CurrentNodes, TInput, TContext, TLevels, NextNodes, TFullGrammar> extends [
      infer R,
      infer Remaining extends string,
    ]
    ? [R, Remaining]
    : ParseLevels<NextNodes, TInput, TContext, TFullGrammar>
  : TLevels extends readonly [infer LastNodes extends readonly NodeSchema[]]
    ? // Single level (atoms) - try nodes, atoms use self as next
      ParseNodes<LastNodes, TInput, TContext, TLevels, TLevels, TFullGrammar>
    : []; // Empty grammar - no match

// =============================================================================
// Main Parse Type
// =============================================================================

/**
 * Parse<Grammar, Input, Context>
 *
 * Main entry point for type-level parsing.
 *
 * @example
 * type Result = Parse<MyGrammar, "1+2", Context>;
 * // [BinaryNode<"add", NumberNode<"1">, NumberNode<"2">, "number">, ""]
 */
export type Parse<
  TGrammar extends Grammar,
  TInput extends string,
  TContext extends Context,
> = ParseLevels<TGrammar, TInput, TContext, TGrammar>;
