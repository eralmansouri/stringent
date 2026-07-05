/**
 * Grammar Type Computation
 *
 * Computes a grammar TYPE from node schemas. The grammar is a flat tuple
 * of precedence levels, sorted from lowest to highest precedence, with
 * atoms as the final element.
 *
 * Example:
 *   [[AddOps], [MulOps], [Atoms]]
 *   // level 0 (lowest prec) → level 1 → atoms (last)
 *
 * Precedence must be a non-negative safe integer (or "atom"). This is
 * enforced at runtime by createParser; at the type level, invalid
 * precedences resolve the grammar to never.
 */

import type { NodeSchema, Precedence } from "../schema/index.js";

// =============================================================================
// Grammar Type
// =============================================================================

/**
 * A grammar is a tuple of levels, where each level is an array of node schemas.
 * Sorted by precedence (lowest first), atoms last.
 */
export type Grammar = readonly (readonly NodeSchema[])[];

// =============================================================================
// Numeric comparison (non-negative integers, digit-wise — no tuple-length
// limits, so precedences of any practical magnitude compare fine)
// =============================================================================

/** Reject negative, fractional, or exponential-form precedences */
type IsValidPrecedence<P extends number> = `${P}` extends
  | `-${string}`
  | `${string}.${string}`
  | `${string}e${string}`
  ? false
  : true;

/** Tiny tuples (≤9 elements) for single-digit comparison */
interface DigitTup {
  "0": [];
  "1": [0];
  "2": [0, 0];
  "3": [0, 0, 0];
  "4": [0, 0, 0, 0];
  "5": [0, 0, 0, 0, 0];
  "6": [0, 0, 0, 0, 0, 0];
  "7": [0, 0, 0, 0, 0, 0, 0];
  "8": [0, 0, 0, 0, 0, 0, 0, 0];
  "9": [0, 0, 0, 0, 0, 0, 0, 0, 0];
}

type DigitLte<A extends string, B extends string> = A extends keyof DigitTup
  ? B extends keyof DigitTup
    ? DigitTup[B] extends [...DigitTup[A], ...0[]]
      ? true
      : false
    : false
  : false;

/** len(A) < len(B), by chomping one char from each */
type ShorterThan<A extends string, B extends string> = A extends ""
  ? B extends ""
    ? false
    : true
  : B extends ""
  ? false
  : A extends `${string}${infer AR}`
  ? B extends `${string}${infer BR}`
    ? ShorterThan<AR, BR>
    : never
  : never;

/** Lexicographic digit comparison; assumes equal length */
type SameLenLexLte<A extends string, B extends string> = A extends ""
  ? true
  : A extends `${infer AD}${infer AR}`
  ? B extends `${infer BD}${infer BR}`
    ? AD extends BD
      ? SameLenLexLte<AR, BR>
      : DigitLte<AD, BD>
    : true
  : true;

/**
 * A <= B for non-negative integers. Canonical decimal strings: for
 * non-negative integers without leading zeros, a shorter numeral is
 * always smaller; equal-length numerals compare lexicographically.
 */
type Lte<A extends number, B extends number> = ShorterThan<
  `${A}`,
  `${B}`
> extends true
  ? true
  : ShorterThan<`${B}`, `${A}`> extends true
  ? false
  : SameLenLexLte<`${A}`, `${B}`>;

// =============================================================================
// Insertion sort (with dedupe) over precedence numbers
// =============================================================================

type Insert<P extends number, T extends readonly number[]> = T extends readonly [
  infer H extends number,
  ...infer R extends readonly number[]
]
  ? P extends H
    ? T // duplicate → keep once
    : Lte<P, H> extends true
    ? [P, ...T]
    : [H, ...Insert<P, R>]
  : [P];

/** Collect the distinct numeric precedences of TNodes, sorted ascending */
type SortedPrecedences<
  TNodes extends readonly NodeSchema[],
  Acc extends readonly number[] = []
> = TNodes extends readonly [
  infer H extends NodeSchema,
  ...infer R extends readonly NodeSchema[]
]
  ? H["precedence"] extends "atom"
    ? SortedPrecedences<R, Acc>
    : IsValidPrecedence<H["precedence"] & number> extends true
    ? SortedPrecedences<R, Insert<H["precedence"] & number, Acc>>
    : never
  : Acc;

// =============================================================================
// Filter nodes per precedence (preserves definition order within a level)
// =============================================================================

type NodesAt<
  TNodes extends readonly NodeSchema[],
  P extends Precedence,
  Acc extends readonly NodeSchema[] = []
> = TNodes extends readonly [
  infer H extends NodeSchema,
  ...infer R extends readonly NodeSchema[]
]
  ? [H["precedence"]] extends [P]
    ? NodesAt<R, P, [...Acc, H]>
    : NodesAt<R, P, Acc>
  : Acc;

type LevelsFor<
  Ps extends readonly number[],
  TNodes extends readonly NodeSchema[]
> = Ps extends readonly [
  infer H extends number,
  ...infer R extends readonly number[]
]
  ? [NodesAt<TNodes, H>, ...LevelsFor<R, TNodes>]
  : [];

// =============================================================================
// ComputeGrammar
// =============================================================================

/**
 * Compute the grammar tuple from node schemas.
 *
 * 1. Collect distinct numeric precedences (insertion sort, ascending)
 * 2. Filter nodes per precedence, preserving definition order
 * 3. Append atoms as the final level
 */
export type ComputeGrammar<TNodes extends readonly NodeSchema[]> = [
  ...LevelsFor<SortedPrecedences<TNodes>, TNodes>,
  NodesAt<TNodes, "atom">
] extends infer G extends Grammar
  ? G
  : never;
