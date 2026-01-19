/**
 * Error Types and Utilities
 *
 * Provides rich error information for parse failures including:
 * - Position tracking (offset, line, column)
 * - Source snippets showing where errors occurred
 * - Descriptive messages for different error types
 */

// =============================================================================
// Position Types
// =============================================================================

/**
 * Source position in the input string.
 */
export interface SourcePosition {
  /** Zero-based character offset from start of input */
  readonly offset: number;
  /** One-based line number */
  readonly line: number;
  /** One-based column number (characters from start of line) */
  readonly column: number;
}

/**
 * Calculate position information from input and current offset.
 *
 * @param input - The original input string
 * @param offset - Character offset into the input
 * @returns Position with line and column numbers
 */
export function calculatePosition(input: string, offset: number): SourcePosition {
  const textBeforeOffset = input.slice(0, offset);
  const lines = textBeforeOffset.split("\n");
  const line = lines.length;
  const column = lines[lines.length - 1].length + 1;

  return { offset, line, column };
}

// =============================================================================
// Error Types
// =============================================================================

/** Error kinds for categorization */
export type ParseErrorKind =
  | "no_match"
  | "type_mismatch"
  | "unterminated_string"
  | "unclosed_paren"
  | "unexpected_token"
  | "empty_input";

/**
 * Rich parse error with position and context information.
 */
export interface RichParseError {
  /** Error marker for type discrimination */
  readonly __error: true;
  /** Error kind for categorization */
  readonly kind: ParseErrorKind;
  /** Human-readable error message */
  readonly message: string;
  /** Position where the error occurred */
  readonly position: SourcePosition;
  /** The problematic input snippet */
  readonly snippet: string;
  /** The full original input */
  readonly input: string;
  /** Additional context (e.g., expected type, actual type) */
  readonly context?: ErrorContext;
}

/**
 * Additional error context for specific error types.
 */
export interface ErrorContext {
  /** Expected type for type mismatch errors */
  expected?: string;
  /** Actual type for type mismatch errors */
  actual?: string;
  /** What was being parsed when error occurred */
  parsing?: string;
}

// =============================================================================
// Error Creation Utilities
// =============================================================================

/**
 * Create a snippet of the input around the error position.
 *
 * @param input - The full input string
 * @param offset - Character offset where error occurred
 * @param contextChars - Number of characters to show around the error
 * @returns A snippet with error position marker
 */
export function createSnippet(
  input: string,
  offset: number,
  contextChars: number = 20
): string {
  if (input.length === 0) return "(empty input)";

  const start = Math.max(0, offset - contextChars);
  const end = Math.min(input.length, offset + contextChars);

  let snippet = "";

  // Add ellipsis if we're not at the start
  if (start > 0) snippet += "...";

  // Add the snippet content
  snippet += input.slice(start, offset);
  snippet += "→"; // Position marker
  snippet += input.slice(offset, end);

  // Add ellipsis if we're not at the end
  if (end < input.length) snippet += "...";

  // Escape control characters for display
  snippet = snippet
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t")
    .replace(/\r/g, "\\r");

  return snippet;
}

/**
 * Create a RichParseError.
 */
export function createParseError(
  kind: ParseErrorKind,
  message: string,
  input: string,
  offset: number,
  context?: ErrorContext
): RichParseError {
  return {
    __error: true,
    kind,
    message,
    position: calculatePosition(input, offset),
    snippet: createSnippet(input, offset),
    input,
    context,
  };
}

/**
 * Create a "no match" error.
 */
export function noMatchError(input: string, offset: number): RichParseError {
  const position = calculatePosition(input, offset);
  const remaining = input.slice(offset).trim();
  const preview = remaining.slice(0, 20) + (remaining.length > 20 ? "..." : "");

  let message: string;
  if (input.trim().length === 0) {
    message = "Empty or whitespace-only input";
  } else if (offset >= input.length) {
    message = "Unexpected end of input";
  } else {
    message = `No grammar rule matched at position ${position.line}:${position.column}: "${preview}"`;
  }

  return createParseError("no_match", message, input, offset);
}

/**
 * Create a "type mismatch" error.
 */
export function typeMismatchError(
  input: string,
  offset: number,
  expected: string,
  actual: string,
  parsing?: string
): RichParseError {
  const position = calculatePosition(input, offset);
  let message = `Type mismatch at ${position.line}:${position.column}: expected '${expected}', got '${actual}'`;
  if (parsing) {
    message += ` while parsing ${parsing}`;
  }

  return createParseError("type_mismatch", message, input, offset, {
    expected,
    actual,
    parsing,
  });
}

/**
 * Create an "unterminated string" error.
 */
export function unterminatedStringError(
  input: string,
  offset: number,
  quote: string
): RichParseError {
  const position = calculatePosition(input, offset);
  const message = `Unterminated string literal at ${position.line}:${position.column}: missing closing ${quote}`;

  return createParseError("unterminated_string", message, input, offset, {
    parsing: "string literal",
  });
}

/**
 * Create an "unclosed parenthesis" error.
 */
export function unclosedParenError(input: string, offset: number): RichParseError {
  const position = calculatePosition(input, offset);
  const message = `Unclosed parenthesis at ${position.line}:${position.column}: missing ')'`;

  return createParseError("unclosed_paren", message, input, offset, {
    parsing: "parenthesized expression",
  });
}

/**
 * Create an "unexpected token" error.
 */
export function unexpectedTokenError(
  input: string,
  offset: number,
  found: string,
  expected?: string
): RichParseError {
  const position = calculatePosition(input, offset);
  let message = `Unexpected token at ${position.line}:${position.column}: found '${found}'`;
  if (expected) {
    message += `, expected ${expected}`;
  }

  return createParseError("unexpected_token", message, input, offset, {
    expected,
    parsing: "expression",
  });
}

/**
 * Create an "empty input" error.
 */
export function emptyInputError(input: string): RichParseError {
  return createParseError(
    "empty_input",
    "Cannot parse empty or whitespace-only input",
    input,
    0
  );
}

// =============================================================================
// Parse Result with Error
// =============================================================================

import type { ASTNode } from "./primitive/index.js";

/**
 * Extended parse result that can include error information.
 * - Empty array: no match (backward compatible)
 * - [node, remaining]: successful parse
 * - [node, remaining, errors]: successful parse with collected errors
 */
export type ParseResultWithErrors<T extends ASTNode<string, unknown> = ASTNode<string, unknown>> =
  | []
  | [T & {}, string]
  | [T & {}, string, RichParseError[]];

/**
 * Check if a result includes errors.
 */
export function hasErrors(result: ParseResultWithErrors): boolean {
  return result.length === 3 && result[2].length > 0;
}

/**
 * Get errors from a result, or empty array if none.
 */
export function getErrors(result: ParseResultWithErrors): RichParseError[] {
  if (result.length === 3) {
    return result[2];
  }
  return [];
}

// =============================================================================
// Error Formatting
// =============================================================================

/**
 * Format an error for display with source context.
 */
export function formatError(error: RichParseError): string {
  const { position, message, snippet } = error;
  const lines: string[] = [];

  lines.push(`Error at line ${position.line}, column ${position.column}:`);
  lines.push(`  ${message}`);
  lines.push("");
  lines.push(`  ${snippet}`);

  if (error.context) {
    const ctx = error.context;
    if (ctx.expected && ctx.actual) {
      lines.push("");
      lines.push(`  Expected: ${ctx.expected}`);
      lines.push(`  Actual:   ${ctx.actual}`);
    }
  }

  return lines.join("\n");
}

/**
 * Format multiple errors for display.
 */
export function formatErrors(errors: RichParseError[]): string {
  return errors.map(formatError).join("\n\n");
}
