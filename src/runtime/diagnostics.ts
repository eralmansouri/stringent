/**
 * Parse Diagnostics
 *
 * Tracks the furthest point the parser reached before failing, plus what it
 * expected there. Recursive-descent parsers with backtracking fail "quietly"
 * at many positions; the furthest failure is almost always the one the user
 * cares about.
 *
 * A mutable Diagnostics object is threaded through the runtime parser as a
 * trailing parameter — the type-level engine has no counterpart and doesn't
 * need one (a compile error IS its diagnostic).
 */

export interface ConstraintMismatch {
  /** Offset into the original input where the mismatched expression starts */
  offset: number;
  /** The constraint the slot required (e.g. "number") */
  expected: string;
  /** The outputSchema the expression actually had */
  actual: string;
  /** The identifier/path text, when the mismatched node is one */
  subject?: string;
}

export interface Diagnostics {
  /** The original input, for offset math */
  readonly source: string;
  /** Furthest offset at which a token failed to match */
  furthestOffset: number;
  /** Token descriptions expected at furthestOffset */
  expected: Set<string>;
  /** Furthest constraint (type) mismatch, reported preferentially */
  mismatch?: ConstraintMismatch;
}

export function createDiagnostics(source: string): Diagnostics {
  return { source, furthestOffset: 0, expected: new Set() };
}

/** Offset of `remaining` within the source, skipping leading whitespace */
export function offsetOf(diag: Diagnostics, remaining: string): number {
  const ws = remaining.length - remaining.trimStart().length;
  return diag.source.length - remaining.length + ws;
}

/** Record a token-level failure: `expected` did not match at `remaining` */
export function fail(
  diag: Diagnostics,
  remaining: string,
  expected: string
): void {
  const offset = offsetOf(diag, remaining);
  if (offset > diag.furthestOffset) {
    diag.furthestOffset = offset;
    diag.expected = new Set([expected]);
  } else if (offset === diag.furthestOffset) {
    diag.expected.add(expected);
  }
}

/** Record a constraint (type) mismatch; keeps the furthest one */
export function failConstraint(
  diag: Diagnostics,
  remaining: string,
  expected: string,
  actual: string,
  subject?: string
): void {
  const offset = offsetOf(diag, remaining);
  if (diag.mismatch === undefined || offset >= diag.mismatch.offset) {
    diag.mismatch = { offset, expected, actual, subject };
  }
}

// =============================================================================
// Error formatting
// =============================================================================

export interface StringentError {
  code: "PARSE_ERROR" | "TYPE_MISMATCH" | "UNEXPECTED_INPUT";
  message: string;
  /** 0-based offset into the input */
  position: number;
  /** Token descriptions that would have been valid at `position` */
  expected?: readonly string[];
  /** The next few characters at `position` */
  found?: string;
}

function foundAt(source: string, position: number): string {
  const snippet = source.slice(position, position + 10);
  return snippet === "" ? "end of input" : `"${snippet}"`;
}

function formatExpected(expected: readonly string[]): string {
  if (expected.length === 0) return "expression";
  if (expected.length === 1) return expected[0];
  return `${expected.slice(0, -1).join(", ")} or ${expected[expected.length - 1]}`;
}

/** Build a StringentError from diagnostics after a failed parse */
export function toParseError(diag: Diagnostics): StringentError {
  const mismatch = diag.mismatch;
  if (mismatch !== undefined && mismatch.offset >= diag.furthestOffset) {
    const subject =
      mismatch.subject !== undefined
        ? mismatch.actual === "unknown"
          ? ` ('${mismatch.subject}' is not in the schema)`
          : ` ('${mismatch.subject}')`
        : "";
    return {
      code: "TYPE_MISMATCH",
      message: `Expected a ${mismatch.expected} expression at position ${mismatch.offset}, got ${mismatch.actual}${subject}`,
      position: mismatch.offset,
      expected: [mismatch.expected],
      found: foundAt(diag.source, mismatch.offset),
    };
  }
  const expected = [...diag.expected].sort();
  return {
    code: "PARSE_ERROR",
    message: `Expected ${formatExpected(expected)} at position ${diag.furthestOffset}, found ${foundAt(diag.source, diag.furthestOffset)}`,
    position: diag.furthestOffset,
    expected,
    found: foundAt(diag.source, diag.furthestOffset),
  };
}

/**
 * Build a StringentError for input left over after a partially-successful
 * parse. When the diagnostics show the parser got FURTHER than the trailing
 * point before backtracking, that furthest failure is the better story
 * (e.g. "1+zz" → the mismatch at 'zz', not "unexpected '+zz'").
 */
export function toUnexpectedInputError(
  diag: Diagnostics,
  remaining: string
): StringentError {
  const position = offsetOf(diag, remaining);
  if (
    (diag.mismatch !== undefined && diag.mismatch.offset >= position) ||
    diag.furthestOffset > position
  ) {
    return toParseError(diag);
  }
  const expected = [...diag.expected].sort();
  const hint =
    diag.furthestOffset >= position && expected.length > 0
      ? ` (expected ${formatExpected(expected)})`
      : "";
  return {
    code: "UNEXPECTED_INPUT",
    message: `Unexpected input at position ${position}: found ${foundAt(diag.source, position)}${hint}`,
    position,
    expected: expected.length > 0 ? expected : undefined,
    found: foundAt(diag.source, position),
  };
}

/** Error thrown by parser.parse() and evaluate() on invalid input */
export class StringentParseError extends Error {
  readonly code: StringentError["code"];
  readonly position: number;
  readonly expected?: readonly string[];
  readonly found?: string;

  constructor(error: StringentError) {
    super(error.message);
    this.name = "StringentParseError";
    this.code = error.code;
    this.position = error.position;
    this.expected = error.expected;
    this.found = error.found;
  }
}
