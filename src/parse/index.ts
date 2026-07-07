/**
 * Parse Type - Type-Level Parsing with Grammar Support (v2)
 *
 * Parse<Grammar, Input, Context> computes the exact result type of parsing
 * an input string against a grammar.
 *
 * The grammar is a flat tuple of precedence levels (see ComputeGrammar):
 *   [[Level0Ops], [Level1Ops], ..., [LeafNodes]]
 *
 * Parsing proceeds:
 * 1. Try operators at current level (index 0, lowest precedence)
 * 2. Fall back to next level (index 1, higher precedence)
 * 3. Base case: the leaf level (last element, plain alternation)
 *
 * v2 semantics, mirroring src/runtime/parser.ts function-for-function:
 * - Associativity derives from each level's TAIL SHAPE: any rest(...) tail
 *   → right-associative recursion; otherwise → left-associative fold.
 * - Constraints are arktype defs; matching is ASSIGNABILITY, computed as
 *   `type.infer<candidate> extends type.infer<constraint>` over literal
 *   def strings (so TS memoizes each distinct check — see
 *   spike/phase0/RESULTS.md). Refinement erasure is automatic here:
 *   type.infer<"number > 0"> is `number`.
 * - A constraint string naming an earlier binding resolves to that
 *   operand's parsed def; overlapping(binding) checks type overlap
 *   (non-never intersection) instead of assignability.
 * - Node outputSchema carries the DEF (a string, or an object def for
 *   object resultTypes / schema records). The runtime displays arktype's
 *   normalized `expression` string instead — behavioral parity is over
 *   accept/reject decisions and inferred TS types, not display strings.
 *
 * Scope caveat (documented): defs resolve in arktype's DEFAULT scope at
 * the type level, so grammars using createParser's `scope` aliases lose
 * literal-mode checking for those defs (use safeParse, or cast).
 */

import type { Token } from "@sinclair/parsebox";
import type { type } from "arktype";
import type { Context } from "../context.js";
import type { Grammar } from "../grammar/index.js";
import type {
  NodeSchema,
  PatternSchema,
  PatternSchemaBase,
  NamedSchema,
  NumberSchema,
  StringSchema,
  BooleanSchema,
  NullSchema,
  UndefinedSchema,
  IdentSchema,
  PathSchema,
  ConstSchema,
  OverlapsRef,
  NormalizeConstraint,
  ExtractSpecOf,
} from "../schema/index.js";
import type {
  NumberNode,
  StringNode,
  BooleanNode,
  NullNode,
  UndefinedNode,
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
  TOutputSchema = unknown
> {
  readonly node: TName;
  readonly outputSchema: TOutputSchema;
  readonly left: TLeft;
  readonly right: TRight;
}

/** Loose AST node shape (dynamic-string results) */
export interface LooseAstNode {
  readonly node: string;
  readonly outputSchema: string;
  readonly [key: string]: unknown;
}

// =============================================================================
// Def-level type algebra
// =============================================================================

/** The TS type of a def (string expression or object def). Refinements
 *  erase automatically (type.infer<"number > 0"> = number). */
export type InferOfDef<D> = D extends string
  ? type.infer<D>
  : D extends object
  ? type.infer<D>
  : never;

/** Assignability over defs — the type-level twin of TypeEnv.isAssignable.
 *  Keep arguments as LITERAL defs so TS memoizes each distinct check. */
type DefAssignable<Candidate, Constraint> = [InferOfDef<Candidate>] extends [
  InferOfDef<Constraint>
]
  ? true
  : false;

/** Overlap over defs — the type-level twin of TypeEnv.isOverlapping.
 *  Approximated as non-never intersection of the inferred types. */
type DefOverlaps<A, B> = [InferOfDef<A> & InferOfDef<B>] extends [never]
  ? false
  : true;

// =============================================================================
// Path Resolution
// =============================================================================

/**
 * Resolve a dotted path against a (possibly nested) schema def.
 * Unknown or partial paths resolve to "unknown". A path ending on a
 * nested record resolves to the record def itself (its object type).
 */
export type ResolvePath<TData, TSegs extends readonly string[]> =
  TSegs extends readonly [
    infer H extends string,
    ...infer R extends readonly string[]
  ]
    ? TData extends object // guard: leaf defs must not be keyed into
      ? H extends keyof TData
        ? ResolvePath<TData[H], R>
        : "unknown"
      : "unknown" // path continues into a leaf def
    : [TData] extends [undefined]
    ? "unknown"
    : TData;

// =============================================================================
// Primitive Parse Types (from Token API)
// =============================================================================

type ParseNumberPrimitive<TInput extends string> =
  Token.TNumber<TInput> extends [infer V extends string, infer R extends string]
    ? [NumberNode<V>, R]
    : [];

type WsChar = " " | "\t" | "\n" | "\r";

type TrimLeftWs<S extends string> = S extends `${WsChar}${infer R}`
  ? TrimLeftWs<R>
  : S;

/** Single-character escape map — MUST match SIMPLE_ESCAPES in
 *  src/runtime/parser.ts. Unknown escapes resolve to the escaped char. */
interface SimpleEscapes {
  n: "\n";
  t: "\t";
  r: "\r";
  "\\": "\\";
  '"': '"';
  "'": "'";
  "`": "`";
  "0": "\0";
  b: "\b";
  f: "\f";
  v: "\v";
}

/**
 * Escape-aware string scanner, mirroring scanString in
 * src/runtime/parser.ts. Returns [raw, value, rest] or [] for
 * unterminated strings. One deliberate divergence: `\xHH` / `\uHHHH`
 * cannot be hex-decoded at the type level, so literal-mode parsing
 * REJECTS them (conservative — safeParse handles them at runtime).
 */
type ScanString<
  Q extends string,
  I extends string,
  Raw extends string = "",
  Val extends string = ""
> = I extends `${Q}${infer R}`
  ? [Raw, Val, R]
  : I extends `\\${infer C}${infer R}`
  ? C extends keyof SimpleEscapes
    ? ScanString<Q, R, `${Raw}\\${C}`, `${Val}${SimpleEscapes[C]}`>
    : C extends "x" | "u"
    ? [] // hex escapes are runtime-only
    : ScanString<Q, R, `${Raw}\\${C}`, `${Val}${C}`>
  : I extends `${infer C}${infer R}`
  ? ScanString<Q, R, `${Raw}${C}`, `${Val}${C}`>
  : []; // unterminated

type ParseStringPrimitive<
  TQuotes extends readonly string[],
  TInput extends string
> = TQuotes extends readonly [
  infer Q extends string,
  ...infer RestQuotes extends readonly string[]
]
  ? TrimLeftWs<TInput> extends `${Q}${infer Body}`
    ? ScanString<Q, Body> extends [
        infer Raw extends string,
        infer Val extends string,
        infer R extends string
      ]
      ? [StringNode<Raw, Val>, R]
      : []
    : ParseStringPrimitive<RestQuotes, TInput>
  : [];

/**
 * Parse a keyword literal (true/false/null/undefined) as a WHOLE
 * identifier — `nullable` is one identifier, so it never matches the
 * `null` keyword (prefix guard). Mirrors parseKeyword in
 * src/runtime/parser.ts.
 */
type ParseKeywordPrimitive<
  TKind extends "boolean" | "null" | "undefined",
  TInput extends string
> = Token.TIdent<TInput> extends [
  infer V extends string,
  infer R extends string
]
  ? TKind extends "boolean"
    ? V extends "true" | "false"
      ? [BooleanNode<V>, R]
      : []
    : V extends TKind
    ? [TKind extends "null" ? NullNode : UndefinedNode, R]
    : []
  : [];

type ParseIdentPrimitive<
  TInput extends string,
  TContext extends Context
> = Token.TIdent<TInput> extends [
  infer V extends string,
  infer R extends string
]
  ? V extends keyof TContext["data"]
    ? [IdentNode<V, TContext["data"][V]>, R]
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
// Constraint Resolution
// =============================================================================

/** Marker for "the referenced binding was not found in the prefix" */
interface NotBound {
  readonly __notBound: true;
}

/**
 * Find the outputSchema def of the named element in the already-consumed
 * pattern prefix (TDone) and its parsed children (TAcc).
 */
type FindBoundOutput<
  TDone extends readonly PatternSchema[],
  TAcc extends readonly unknown[],
  B extends string
> = TDone extends readonly [
  infer F extends PatternSchema,
  ...infer RD extends readonly PatternSchema[]
]
  ? TAcc extends readonly [infer C, ...infer RA extends readonly unknown[]]
    ? F extends { __named: true; name: B }
      ? C extends { outputSchema: infer O }
        ? O
        : "unknown"
      : FindBoundOutput<RD, RA, B>
    : NotBound
  : NotBound;

/**
 * A resolved constraint: undefined (unconstrained) or a check mode plus
 * the def to check against.
 */
type ResolvedSpec =
  | undefined
  | { readonly mode: "extends" | "overlaps"; readonly def: unknown };

/**
 * Resolve an element's constraint against the already-parsed siblings.
 * Mirrors resolveConstraint in src/runtime/parser.ts:
 * - overlapping(b) → overlap check against b's parsed def
 * - a string naming an earlier binding → assignability to its parsed def
 * - any other string → assignability to the static def
 */
type ResolveSpec<
  TElement extends PatternSchema,
  TDone extends readonly PatternSchema[],
  TAcc extends readonly unknown[]
> = NormalizeConstraint<ExtractSpecOf<TElement>> extends infer N
  ? N extends OverlapsRef<infer B>
    ? FindBoundOutput<TDone, TAcc, B> extends infer D
      ? D extends NotBound
        ? { mode: "overlaps"; def: "unknown" }
        : { mode: "overlaps"; def: D }
      : never
    : N extends string
    ? FindBoundOutput<TDone, TAcc, N> extends infer D
      ? D extends NotBound
        ? { mode: "extends"; def: N } // static def
        : { mode: "extends"; def: D } // binding reference
      : never
    : undefined
  : never;

/**
 * Check a candidate's outputSchema def against a resolved constraint.
 * An "unknown" candidate is rejected by every constrained slot — that is
 * how "identifier not in schema" surfaces as a type mismatch.
 */
type CheckConstraint<O, RC extends ResolvedSpec> = [RC] extends [undefined]
  ? true
  : RC extends { mode: infer M; def: infer D }
  ? [O] extends ["unknown"]
    ? false
    : M extends "overlaps"
    ? DefOverlaps<O, D>
    : DefAssignable<O, D>
  : false;

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
  : TElement extends BooleanSchema
  ? ParseKeywordPrimitive<"boolean", TInput>
  : TElement extends NullSchema
  ? ParseKeywordPrimitive<"null", TInput>
  : TElement extends UndefinedSchema
  ? ParseKeywordPrimitive<"undefined", TInput>
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
 * TCurrentLevels - grammar from current level onward (for rest)
 * TNextLevels - grammar from next level onward (for operand, avoids left-recursion)
 * TFullGrammar - complete grammar (for expr role, full reset)
 * TAcc - children parsed so far (also feeds binding-reference resolution)
 * TDone - pattern elements consumed so far (aligned with TAcc)
 *
 * The left-fold seeds TAcc/TDone with the already-parsed left operand so
 * references like rest("left") resolve inside operator tails.
 *
 * Returns [children, rest] where children INCLUDES any seeded prefix.
 */
type ParsePatternTuple<
  TPattern extends readonly PatternSchema[],
  TInput extends string,
  TContext extends Context,
  TCurrentLevels extends Grammar,
  TNextLevels extends Grammar,
  TFullGrammar extends Grammar,
  TAcc extends unknown[] = [],
  TDone extends readonly PatternSchema[] = []
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
      TFullGrammar,
      TDone,
      TAcc
    > extends [infer R, infer Remaining extends string]
    ? ParsePatternTuple<
        Rest,
        Remaining,
        TContext,
        TCurrentLevels,
        TNextLevels,
        TFullGrammar,
        [...TAcc, R],
        [...TDone, First]
      >
    : []
  : [TAcc, TInput];

/**
 * Parse an expression element based on its role.
 *
 * Role determines which grammar slice is used:
 * - "operand": TNextLevels (a tighter expression; avoids left-recursion)
 * - "rest": TCurrentLevels (same level → right-associative recursion)
 * - "expr": TFullGrammar (full reset; only in delimited contexts)
 */
type ParseElementWithLevel<
  TElement extends PatternSchema,
  TInput extends string,
  TContext extends Context,
  TCurrentLevels extends Grammar,
  TNextLevels extends Grammar,
  TFullGrammar extends Grammar,
  TDone extends readonly PatternSchema[],
  TAcc extends readonly unknown[]
> = TElement extends { kind: "expr"; role: infer Role }
  ? Role extends "operand"
    ? ParseExprWithConstraint<TNextLevels, TInput, TContext, ResolveSpec<TElement, TDone, TAcc>, TFullGrammar>
    : Role extends "rest"
    ? ParseExprWithConstraint<TCurrentLevels, TInput, TContext, ResolveSpec<TElement, TDone, TAcc>, TFullGrammar>
    : ParseExprWithConstraint<TFullGrammar, TInput, TContext, ResolveSpec<TElement, TDone, TAcc>, TFullGrammar>
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
 * Compute a node's outputSchema def: a binding name derives from that
 * operand's parsed def; anything else is the static def itself (string or
 * object). Mirrors buildNodeResult in src/runtime/parser.ts.
 *
 * resultType is an OPTIONAL property, so undefined must be stripped before
 * matching.
 */
type ResultSchemaOf<TNode extends NodeSchema, Bindings> = Exclude<
  TNode["resultType"],
  undefined
> extends infer R
  ? [R] extends [string]
    ? R extends keyof Bindings
      ? Bindings[R] extends { outputSchema: infer O }
        ? O
        : "unknown"
      : R // static string def
    : [R] extends [object]
    ? R // static object def
    : "unknown"
  : never;

/**
 * Build the result node from parsed children.
 *
 * - Single unnamed non-const child: passthrough (leaf alternation entry)
 * - Otherwise: bindings become node fields, outputSchema from ResultSchemaOf
 *   (const-only and multi-unnamed patterns build a plain node — mirroring
 *   the runtime engine, never `never`)
 */
type BuildNodeResult<
  TNode extends NodeSchema,
  TChildren extends unknown[]
> = ExtractBindings<TNode["pattern"], TChildren> extends infer Bindings
  ? keyof Bindings extends never
    ? TChildren extends [infer Only]
      ? Only extends { node: "const" }
        ? {
            readonly node: TNode["name"];
            readonly outputSchema: ResultSchemaOf<TNode, {}>;
          }
        : Only // Single unnamed non-const element - passthrough
      : {
          readonly node: TNode["name"];
          readonly outputSchema: ResultSchemaOf<TNode, {}>;
        }
    : {
        readonly node: TNode["name"];
        readonly outputSchema: ResultSchemaOf<TNode, Bindings>;
      } & Bindings
  : never;

// =============================================================================
// Expression Parsing with Constraint
// =============================================================================

/**
 * Parse an expression, then check its outputSchema def against the
 * resolved constraint. Type mismatch → backtrack (empty result).
 */
type ParseExprWithConstraint<
  TStartLevels extends Grammar,
  TInput extends string,
  TContext extends Context,
  TConstraint extends ResolvedSpec,
  TFullGrammar extends Grammar
> = ParseLevels<TStartLevels, TInput, TContext, TFullGrammar> extends [
  infer Node extends { outputSchema: unknown },
  infer Rest extends string
]
  ? CheckConstraint<Node["outputSchema"], TConstraint> extends true
    ? [Node, Rest]
    : [] // Type mismatch - backtrack
  : [];

// =============================================================================
// Level Parsing
// =============================================================================

/**
 * Try parsing each node in a level (recursive descent / leaf alternation).
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

/** Does the pattern's final element parse at the current level (rest)? */
type TailIsRest<N extends NodeSchema> = N["pattern"] extends readonly [
  ...infer _Init,
  infer Last extends PatternSchema
]
  ? Last extends { kind: "expr"; role: "rest" }
    ? true
    : false
  : false;

/**
 * A level is right-associative when ANY of its nodes has an rest(...) tail;
 * otherwise (operand tails / closed patterns) it folds left-associatively.
 * createParser validates that a level never mixes operand and rest tails.
 * Mirrors the mode computation in src/runtime/compile.ts.
 */
type HasRestTail<TNodes extends readonly NodeSchema[]> = TNodes extends readonly [
  infer First extends NodeSchema,
  ...infer Rest extends readonly NodeSchema[]
]
  ? TailIsRest<First> extends true
    ? true
    : HasRestTail<Rest>
  : false;

/** Check TLeft against the constraint of the pattern's leading operand element.
 *  (Binding references are invalid at position 0 — createParser rejects
 *  them.) */
type OperandConstraintOk<OperandEl extends PatternSchema, TLeft> = OperandEl extends {
  kind: "expr";
}
  ? TLeft extends { outputSchema: infer O }
    ? CheckConstraint<O, ResolveSpec<OperandEl, [], []>>
    : false
  : false;

/**
 * Try one node's tail (pattern minus the leading operand element) against the
 * input, folding TLeft into a new left-nested node on success.
 *
 * TAcc/TDone are seeded with the left operand so binding references
 * resolve inside the tail. Tail operands are operand(...) elements, so they
 * parse at the next level via their role — the fold itself is what makes
 * the level left-associative.
 */
type ParseLeftTail<
  N extends NodeSchema,
  Cur extends Grammar,
  Next extends Grammar,
  TLeft,
  TInput extends string,
  TContext extends Context,
  TFull extends Grammar
> = N["pattern"] extends readonly [
  infer OperandEl extends PatternSchema,
  ...infer Tail extends readonly PatternSchema[]
]
  ? OperandConstraintOk<OperandEl, TLeft> extends true
    ? ParsePatternTuple<
        Tail,
        TInput,
        TContext,
        Cur,
        Next,
        TFull,
        [TLeft],
        [OperandEl]
      > extends [infer Children extends unknown[], infer Rest extends string]
      ? [BuildNodeResult<N, Children>, Rest]
      : []
    : []
  : [];

/** Try each node in the level for one fold step. */
type ParseLeftStep<
  TNodes extends readonly NodeSchema[],
  Cur extends Grammar,
  Next extends Grammar,
  TLeft,
  TInput extends string,
  TContext extends Context,
  TFull extends Grammar
> = TNodes extends readonly [
  infer N extends NodeSchema,
  ...infer RestNodes extends readonly NodeSchema[]
]
  ? ParseLeftTail<N, Cur, Next, TLeft, TInput, TContext, TFull> extends [
      infer R,
      infer Rest extends string
    ]
    ? [R, Rest]
    : ParseLeftStep<RestNodes, Cur, Next, TLeft, TInput, TContext, TFull>
  : [];

/**
 * Fold operator applications left-to-right.
 *
 * Written in strict tail position so TypeScript's tail-recursion elimination
 * applies: long chains grow the iteration count (limit ~1000), not the
 * instantiation depth (limit ~50).
 */
type ParseLeftFold<
  CurNodes extends readonly NodeSchema[],
  Cur extends Grammar,
  Next extends Grammar,
  TLeft,
  TInput extends string,
  TContext extends Context,
  TFull extends Grammar
> = ParseLeftStep<CurNodes, Cur, Next, TLeft, TInput, TContext, TFull> extends [
  infer NewLeft,
  infer Rest extends string
]
  ? ParseLeftFold<CurNodes, Cur, Next, NewLeft, Rest, TContext, TFull>
  : [TLeft, TInput];

/**
 * Parse a left-associative level: seed with an operand from the next level,
 * then fold `op operand` repetitions into left-nested nodes.
 * "5-2-1" → sub(sub(5, 2), 1)
 */
type ParseLeftLevel<
  CurNodes extends readonly NodeSchema[],
  Cur extends Grammar,
  Next extends Grammar,
  TInput extends string,
  TContext extends Context,
  TFull extends Grammar
> = ParseLevels<Next, TInput, TContext, TFull> extends [
  infer L,
  infer R extends string
]
  ? ParseLeftFold<CurNodes, Cur, Next, L, R, TContext, TFull>
  : [];

/**
 * Parse using grammar levels (flat tuple).
 *
 * TLevels is the remaining levels to try, starting from current.
 * - The single remaining level is the LEAF level: plain alternation
 * - Levels with an rest(...) tail: recursive descent (right-associative)
 * - Otherwise: the iterative left fold
 */
type ParseLevels<
  TLevels extends Grammar,
  TInput extends string,
  TContext extends Context,
  TFullGrammar extends Grammar
> = TLevels extends readonly [infer OnlyLevel extends readonly NodeSchema[]]
  ? ParseNodes<OnlyLevel, TInput, TContext, TLevels, [], TFullGrammar>
  : TLevels extends readonly [
      infer CurrentNodes extends readonly NodeSchema[],
      ...infer NextNodes extends Grammar
    ]
  ? HasRestTail<CurrentNodes> extends true
    ? ParseNodes<
        CurrentNodes,
        TInput,
        TContext,
        TLevels,
        NextNodes,
        TFullGrammar
      > extends [infer R, infer Remaining extends string]
      ? [R, Remaining]
      : ParseLevels<NextNodes, TInput, TContext, TFullGrammar>
    : ParseLeftLevel<
        CurrentNodes,
        TLevels,
        NextNodes,
        TInput,
        TContext,
        TFullGrammar
      >
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
