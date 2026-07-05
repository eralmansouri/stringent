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
 *
 * Levels whose nodes declare associativity: "left" are parsed with an
 * iterative fold (see ParseLeftLevel) instead of right-recursion.
 *
 * This file MUST stay behaviorally in sync with the runtime engine in
 * src/runtime/parser.ts — the parity test suite guards this.
 */

import type { Token } from "@sinclair/parsebox";
import type { Context, SchemaShape } from "../context.js";
import type { Grammar } from "../grammar/index.js";
import type {
  NodeSchema,
  PatternSchema,
  PatternSchemaBase,
  NamedSchema,
  NumberSchema,
  StringSchema,
  IdentSchema,
  PathSchema,
  ConstSchema,
} from "../schema/index.js";
import type {
  NumberNode,
  StringNode,
  IdentNode,
  PathNode,
  ConstNode,
} from "../primitive/index.js";

// =============================================================================
// AST Node Types
// =============================================================================

/** Binary operator node (helper for writing expected AST types) */
export interface BinaryNode<
  TName extends string = string,
  TLeft = unknown,
  TRight = unknown,
  TOutputSchema extends string = string
> {
  readonly node: TName;
  readonly outputSchema: TOutputSchema;
  readonly left: TLeft;
  readonly right: TRight;
}

// =============================================================================
// Path Resolution
// =============================================================================

/**
 * Resolve a dotted path against a (possibly nested) schema.
 * Unknown or partial paths resolve to "unknown".
 */
export type ResolvePath<TData, TSegs extends readonly string[]> =
  TSegs extends readonly [
    infer H extends string,
    ...infer R extends readonly string[]
  ]
    ? TData extends SchemaShape // guard: string leaves must not be keyed into
      ? H extends keyof TData
        ? ResolvePath<TData[H], R>
        : "unknown"
      : "unknown" // path continues into a leaf type-name
    : TData extends string
    ? TData
    : "unknown"; // path ended on a nested record

// =============================================================================
// Primitive Parse Types (from Token API)
// =============================================================================

type ParseNumberPrimitive<TInput extends string> =
  Token.TNumber<TInput> extends [infer V extends string, infer R extends string]
    ? [NumberNode<V>, R]
    : [];

type ParseStringPrimitive<
  TQuotes extends readonly string[],
  TInput extends string
> = Token.TString<[...TQuotes], TInput> extends [
  infer V extends string,
  infer R extends string
]
  ? [StringNode<V>, R]
  : [];

type ParseIdentPrimitive<
  TInput extends string,
  TContext extends Context
> = Token.TIdent<TInput> extends [
  infer V extends string,
  infer R extends string
]
  ? V extends keyof TContext["data"]
    ? TContext["data"][V] extends infer T extends string
      ? [IdentNode<V, T>, R]
      : [IdentNode<V, "unknown">, R] // nested record → bare ident is "unknown"
    : [IdentNode<V, "unknown">, R]
  : [];

type StartsWithWs<S extends string> = S extends
  | ` ${string}`
  | `\t${string}`
  | `\n${string}`
  | `\r${string}`
  ? true
  : false;

/**
 * Parse a dotted path: ident(.ident)*
 *
 * Whitespace rules (mirrored exactly by the runtime engine):
 * - space BEFORE a dot ends the path ("values .p" → path ["values"], rest " .p")
 * - space AFTER a dot fails the whole element ("values. p" → no match)
 * - dangling dot fails the whole element ("values." → no match)
 */
type ParsePathPrimitive<
  TInput extends string,
  TContext extends Context
> = Token.TIdent<TInput> extends [
  infer First extends string,
  infer R extends string
]
  ? ParsePathSegments<R, [First], TContext>
  : [];

type ParsePathSegments<
  TInput extends string,
  TSegs extends readonly string[],
  TContext extends Context
> = TInput extends `.${infer AfterDot}`
  ? StartsWithWs<AfterDot> extends true
    ? [] // "values. password" → fail whole element
    : Token.TIdent<AfterDot> extends [
        infer Seg extends string,
        infer R extends string
      ]
    ? ParsePathSegments<R, [...TSegs, Seg], TContext>
    : [] // dangling dot "values." → fail whole element
  : [PathNode<TSegs, ResolvePath<TContext["data"], TSegs>>, TInput];

type ParseConstPrimitive<
  TValue extends string,
  TInput extends string
> = Token.TConst<TValue, TInput> extends [
  infer _V extends string,
  infer R extends string
]
  ? [ConstNode<TValue>, R]
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
  TContext extends Context
> = TElement extends NumberSchema
  ? ParseNumberPrimitive<TInput>
  : TElement extends StringSchema<infer Q>
  ? ParseStringPrimitive<Q, TInput>
  : TElement extends IdentSchema
  ? ParseIdentPrimitive<TInput, TContext>
  : TElement extends PathSchema
  ? ParsePathPrimitive<TInput, TContext>
  : TElement extends ConstSchema<infer V>
  ? ParseConstPrimitive<V, TInput>
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
  TAcc extends unknown[] = []
> = TPattern extends readonly [
  infer First extends PatternSchema,
  ...infer Rest extends readonly PatternSchema[]
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
 * Extract constraint from an ExprSchema.
 *
 * The constraint property is OPTIONAL on ExprSchema, so it must be matched
 * with `constraint?:` — matching against a required property never succeeds
 * and silently disables constraint checking. Unconstrained elements (plain
 * `string` constraint or undefined) resolve to undefined.
 */
type ExtractConstraint<T> = T extends { constraint?: infer C }
  ? [Exclude<C, undefined>] extends [never]
    ? undefined // constraint absent
    : [string] extends [Exclude<C, undefined>]
    ? undefined // unconstrained: lhs()/rhs()/expr() without argument
    : Exclude<C, undefined>
  : undefined;

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
  TFullGrammar extends Grammar
> = TElement extends { kind: "expr"; role: infer Role }
  ? Role extends "lhs"
    ? ParseExprWithConstraint<TNextLevels, TInput, TContext, ExtractConstraint<TElement>, TFullGrammar>
    : Role extends "rhs"
    ? ParseExprWithConstraint<TCurrentLevels, TInput, TContext, ExtractConstraint<TElement>, TFullGrammar>
    : ParseExprWithConstraint<TFullGrammar, TInput, TContext, ExtractConstraint<TElement>, TFullGrammar>
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
  TFullGrammar extends Grammar
> = ParsePatternTuple<
  TNode["pattern"],
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
  TAcc extends {} = {}
> = TPattern extends readonly [
  infer First extends PatternSchema,
  ...infer RestPattern extends readonly PatternSchema[]
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
 * Build the result node from parsed children.
 *
 * Uses named bindings from .as() to determine node fields.
 * - Single unnamed child: passthrough (atom behavior)
 * - Otherwise: bindings become node fields
 */
type BuildNodeResult<
  TNode extends NodeSchema,
  TChildren extends unknown[]
> = ExtractBindings<TNode["pattern"], TChildren> extends infer Bindings
  ? keyof Bindings extends never
    ? TChildren extends [infer Only]
      ? Only // Single unnamed element - passthrough (atom)
      : never // Multiple unnamed children - error
    : {
        readonly node: TNode["name"];
        readonly outputSchema: TNode["resultType"];
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
  TFullGrammar extends Grammar
> = ParseLevels<TStartLevels, TInput, TContext, TFullGrammar> extends [
  infer Node extends { outputSchema: string },
  infer Rest extends string
]
  ? TConstraint extends string
    ? Node["outputSchema"] extends TConstraint
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
  TFullGrammar extends Grammar
> = TNodes extends readonly [
  infer First extends NodeSchema,
  ...infer Rest extends readonly NodeSchema[]
]
  ? ParseNodePattern<
      First,
      TInput,
      TContext,
      TCurrentLevels,
      TNextLevels,
      TFullGrammar
    > extends [infer R, infer Remaining extends string]
    ? [R, Remaining]
    : ParseNodes<
        Rest,
        TInput,
        TContext,
        TCurrentLevels,
        TNextLevels,
        TFullGrammar
      >
  : [];

// =============================================================================
// Left-Associative Level Parsing
// =============================================================================

/** A level is left-associative when its nodes declare associativity: "left".
 *  createParser validates that a level never mixes associativities, so
 *  checking the first node suffices. */
type IsLeftLevel<TNodes extends readonly NodeSchema[]> =
  TNodes extends readonly [infer First extends NodeSchema, ...readonly NodeSchema[]]
    ? First["associativity"] extends "left"
      ? true
      : false
    : false;

/** Check TLeft against the constraint of the pattern's leading lhs element. */
type LhsConstraintOk<LhsEl, TLeft> = LhsEl extends { kind: "expr" }
  ? ExtractConstraint<LhsEl> extends infer C
    ? C extends string
      ? TLeft extends { outputSchema: C }
        ? true
        : false
      : true
    : never
  : false;

/**
 * Try one node's tail (pattern minus the leading lhs element) against the
 * input, folding TLeft into a new left-nested node on success.
 * The tail's rhs elements parse at the NEXT level (currentLevels := Next),
 * which is what makes the fold left-associative.
 */
type ParseLeftTail<
  N extends NodeSchema,
  Next extends Grammar,
  TLeft,
  TInput extends string,
  TContext extends Context,
  TFull extends Grammar
> = N["pattern"] extends readonly [
  infer LhsEl extends PatternSchema,
  ...infer Tail extends readonly PatternSchema[]
]
  ? LhsConstraintOk<LhsEl, TLeft> extends true
    ? ParsePatternTuple<Tail, TInput, TContext, Next, Next, TFull> extends [
        infer Children extends unknown[],
        infer Rest extends string
      ]
      ? [BuildNodeResult<N, [TLeft, ...Children]>, Rest]
      : []
    : []
  : [];

/** Try each node in the level for one fold step. */
type ParseLeftStep<
  TNodes extends readonly NodeSchema[],
  Next extends Grammar,
  TLeft,
  TInput extends string,
  TContext extends Context,
  TFull extends Grammar
> = TNodes extends readonly [
  infer N extends NodeSchema,
  ...infer RestNodes extends readonly NodeSchema[]
]
  ? ParseLeftTail<N, Next, TLeft, TInput, TContext, TFull> extends [
      infer R,
      infer Rest extends string
    ]
    ? [R, Rest]
    : ParseLeftStep<RestNodes, Next, TLeft, TInput, TContext, TFull>
  : [];

/**
 * Fold operator applications left-to-right.
 *
 * Written in strict tail position so TypeScript's tail-recursion elimination
 * applies: long chains grow the iteration count (limit ~1000), not the
 * instantiation depth (limit ~50).
 */
type ParseLeftFold<
  Cur extends readonly NodeSchema[],
  Next extends Grammar,
  TLeft,
  TInput extends string,
  TContext extends Context,
  TFull extends Grammar
> = ParseLeftStep<Cur, Next, TLeft, TInput, TContext, TFull> extends [
  infer NewLeft,
  infer Rest extends string
]
  ? ParseLeftFold<Cur, Next, NewLeft, Rest, TContext, TFull>
  : [TLeft, TInput];

/**
 * Parse a left-associative level: seed with an operand from the next level,
 * then fold `op operand` repetitions into left-nested nodes.
 * "5-2-1" → sub(sub(5, 2), 1)
 */
type ParseLeftLevel<
  Cur extends readonly NodeSchema[],
  Next extends Grammar,
  TInput extends string,
  TContext extends Context,
  TFull extends Grammar
> = ParseLevels<Next, TInput, TContext, TFull> extends [
  infer L,
  infer R extends string
]
  ? ParseLeftFold<Cur, Next, L, R, TContext, TFull>
  : [];

/**
 * Parse using grammar levels (flat tuple).
 *
 * TLevels is the remaining levels to try, starting from current.
 * - Left-associative levels use the iterative fold
 * - Otherwise: try nodes at first level; if no match, fall back to rest
 * - Base case: empty grammar - no match
 */
type ParseLevels<
  TLevels extends Grammar,
  TInput extends string,
  TContext extends Context,
  TFullGrammar extends Grammar
> = TLevels extends readonly [
  infer CurrentNodes extends readonly NodeSchema[],
  ...infer NextNodes extends Grammar
]
  ? IsLeftLevel<CurrentNodes> extends true
    ? ParseLeftLevel<CurrentNodes, NextNodes, TInput, TContext, TFullGrammar>
    : ParseNodes<
        CurrentNodes,
        TInput,
        TContext,
        TLevels,
        NextNodes,
        TFullGrammar
      > extends [infer R, infer Remaining extends string]
    ? [R, Remaining]
    : ParseLevels<NextNodes, TInput, TContext, TFullGrammar>
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
 * // [{ node: "add", outputSchema: "number", left: ..., right: ... }, ""]
 */
export type Parse<
  TGrammar extends Grammar,
  TInput extends string,
  TContext extends Context
> = ParseLevels<TGrammar, TInput, TContext, TGrammar>;
