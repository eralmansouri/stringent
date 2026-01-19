/**
 * Primitive Factory System
 *
 * Creates context-aware parser primitives using Parsebox Token API.
 * Parse methods are generic - return types computed from input literals.
 *
 * IMPORTANT: All parse methods MUST be generic in context:
 *   parse<TInput extends string, $ extends Context>(input: TInput, $: $)
 *
 * DO NOT remove the $ generic parameter - it ensures schema type information
 * flows through the parser chain. See CLAUDE.md for details.
 */
import { Token } from '@sinclair/parsebox';
import type { Context } from '../context.js';
import type { ToNumber } from 'hotscript/dist/internals/numbers/impl/utils.js';

// Re-export Context for convenience
export type { Context } from '../context.js';

// =============================================================================
// Core Types
// =============================================================================

/** Parse result: empty = no match, [value, rest] = matched */
export type ParseResult<T, R extends string = string> = [] | [T, R];

// =============================================================================
// Node Types
// =============================================================================

export interface ASTNode<TType extends string = string, TOutputSchema = unknown> {
  node: TType;
  outputSchema: TOutputSchema;
}

//type LiteralKind = "number" | "string" | "boolean" | "null" | "undefined";

// export interface LiteralNode<
//   TSchema extends LiteralKind,
//   TValue
// > extends ASTNode<"literal", TSchema> {
//   raw: TValue;
// }

export interface IdentNode<
  TName extends string = string,
  TOutputSchema = 'unknown',
> extends ASTNode<'identifier', TOutputSchema> {
  name: TName;
}

export type NumberNode<TValue extends string = string> = ASTNode<'literal', 'number'> & {
  raw: TValue;
  value: ToNumber<TValue>;
};

export type StringNode<TValue extends string = string> = ASTNode<'literal', 'string'> & {
  raw: TValue;
  value: TValue;
};

export type NullNode = ASTNode<'literal', 'null'> & {
  raw: 'null';
  value: null;
};
export type UndefinedNode = ASTNode<'literal', 'undefined'> & {
  raw: 'undefined';
  value: undefined;
};

export type BooleanNode<TValue extends string = string> = ASTNode<'literal', 'boolean'> & {
  raw: TValue;
  value: TValue extends 'true' ? true : false;
};

export type LiteralNode = NumberNode | StringNode | NullNode | UndefinedNode | BooleanNode;

export type ConstNode<TValue extends string = string> = ASTNode<'const', TValue>;

// =============================================================================
// Parse Result Types (computed from input)
// =============================================================================

/** Computed parse result for Number */
export type ParseNumber<TInput extends string> =
  Token.TNumber<TInput> extends [infer V extends string, infer R extends string]
    ? [NumberNode<V>, R]
    : [];

/** Computed parse result for String */
export type ParseString<TQuotes extends string[], TInput extends string> =
  Token.TString<TQuotes, TInput> extends [infer V extends string, infer R extends string]
    ? [StringNode<V>, R]
    : [];

/** Computed parse result for Ident - looks up value type from schema */
export type ParseIdent<TInput extends string, $ extends Context> =
  Token.TIdent<TInput> extends [infer V extends string, infer R extends string]
    ? V extends keyof $['data']
      ? [IdentNode<V, $['data'][V]>, R]
      : [IdentNode<V>, R]
    : [];

/** Computed parse result for Const */
export type ParseConst<TValue extends string, TInput extends string> =
  Token.TConst<TValue, TInput> extends [infer _V extends string, infer R extends string]
    ? [ConstNode<TValue>, R]
    : [];

// =============================================================================
// IParser Interface
// =============================================================================

/**
 * Base parser interface. All parsers implement this.
 * Context is generic to preserve type information.
 */
export interface IParser {
  parse<TInput extends string, $ extends Context>(input: TInput, $: $): [] | [unknown, string];
}

// =============================================================================
// Primitive Implementations
// =============================================================================

/** Number primitive - parses numeric literals using Token.Number */
class _Number {
  readonly __primitive = 'number' as const;

  parse<TInput extends string, $ extends Context>(input: TInput, _$: $): ParseNumber<TInput> {
    // Runtime type is [] | [string, string], but TypeScript computes exact type
    const result = Token.Number(input) as [] | [string, string];
    if (result.length !== 2) return [] as ParseNumber<TInput>;
    return [
      {
        node: 'literal',
        raw: result[0],
        value: +result[0],
        outputSchema: 'number',
      },
      result[1],
    ] as unknown as ParseNumber<TInput>;
  }
}

/** String primitive - parses quoted string literals using Token.String */
class _String<TQuotes extends string[]> {
  readonly __primitive = 'string' as const;
  readonly quotes: TQuotes;

  constructor(quotes: TQuotes) {
    this.quotes = quotes;
  }

  parse<TInput extends string, $ extends Context>(
    input: TInput,
    _$: $
  ): ParseString<TQuotes, TInput> {
    const result = Token.String(this.quotes, input) as [] | [string, string];
    if (result.length !== 2) return [] as ParseString<TQuotes, TInput>;
    return [
      {
        node: 'literal',
        raw: result[0],
        value: result[0],
        outputSchema: 'string',
      },
      result[1],
    ] as unknown as ParseString<TQuotes, TInput>;
  }
}

/** Identifier primitive - parses identifiers using Token.Ident */
class _Ident {
  readonly __primitive = 'ident' as const;

  parse<TInput extends string, $ extends Context>(input: TInput, $: $): ParseIdent<TInput, $> {
    const result = Token.Ident(input) as [] | [string, string];
    if (result.length !== 2) return [] as ParseIdent<TInput, $>;
    const name = result[0];
    const data = $.data as Record<string, string>;
    const valueType = name in data ? data[name] : 'unknown';
    return [
      { node: 'identifier', name, outputSchema: valueType },
      result[1],
    ] as unknown as ParseIdent<TInput, $>;
  }
}

/** Const primitive - parses exact string matches using Token.Const */
class _Const<TValue extends string> {
  readonly __primitive = 'const' as const;
  readonly value: TValue;

  constructor(value: TValue) {
    this.value = value;
  }

  parse<TInput extends string, $ extends Context>(
    input: TInput,
    _$: $
  ): ParseConst<TValue, TInput> {
    const result = Token.Const(this.value, input) as [] | [string, string];
    if (result.length !== 2) return [] as ParseConst<TValue, TInput>;
    return [
      { node: 'const', outputSchema: JSON.stringify(this.value) },
      result[1],
    ] as unknown as ParseConst<TValue, TInput>;
  }
}

// =============================================================================
// Internal Factories (used by runtime parser)
// =============================================================================

/** @internal */
export const createNumber = (): _Number => new _Number();

/** @internal */
export const createString = <TQuotes extends string[]>(quotes: [...TQuotes]): _String<TQuotes> =>
  new _String(quotes);

/** @internal */
export const createIdent = (): _Ident => new _Ident();

/** @internal */
export const createConst = <TValue extends string>(value: TValue): _Const<TValue> =>
  new _Const(value);

// Export class types for type-level matching (internal use)
export type { _Number, _String, _Ident, _Const };
