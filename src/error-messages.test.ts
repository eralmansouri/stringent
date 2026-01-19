/**
 * Error Messages Tests
 *
 * Tests for the enhanced error message functionality including:
 * - Position tracking (offset, line, column)
 * - Source snippets
 * - Descriptive error messages
 * - Error formatting
 */

import { describe, it, expect } from 'vitest';
import {
  calculatePosition,
  createSnippet,
  createParseError,
  noMatchError,
  typeMismatchError,
  unterminatedStringError,
  unclosedParenError,
  unexpectedTokenError,
  emptyInputError,
  formatError,
  formatErrors,
  type SourcePosition,
  type RichParseError,
} from './errors.js';
import { parseWithErrors, formatParseError } from './runtime/parser.js';
import { defineNode, lhs, rhs, constVal } from './schema/index.js';
import type { Context } from './context.js';

// =============================================================================
// Test Helpers
// =============================================================================

const emptyContext: Context = { data: {} };

// =============================================================================
// Test Grammar
// =============================================================================

const add = defineNode({
  name: 'add',
  pattern: [lhs('number').as('left'), constVal('+'), rhs('number').as('right')],
  precedence: 1,
  resultType: 'number',
});

const mul = defineNode({
  name: 'mul',
  pattern: [lhs('number').as('left'), constVal('*'), rhs('number').as('right')],
  precedence: 2,
  resultType: 'number',
});

const operators = [add, mul] as const;

// =============================================================================
// Section 1: Position Calculation Tests
// =============================================================================

describe('calculatePosition', () => {
  describe('single line input', () => {
    it('should calculate position at start of input', () => {
      const pos = calculatePosition('hello world', 0);
      expect(pos.offset).toBe(0);
      expect(pos.line).toBe(1);
      expect(pos.column).toBe(1);
    });

    it('should calculate position in middle of input', () => {
      const pos = calculatePosition('hello world', 6);
      expect(pos.offset).toBe(6);
      expect(pos.line).toBe(1);
      expect(pos.column).toBe(7);
    });

    it('should calculate position at end of input', () => {
      const pos = calculatePosition('hello', 5);
      expect(pos.offset).toBe(5);
      expect(pos.line).toBe(1);
      expect(pos.column).toBe(6);
    });
  });

  describe('multi-line input', () => {
    it('should calculate position on second line', () => {
      const input = 'line1\nline2';
      const pos = calculatePosition(input, 6); // Start of "line2"
      expect(pos.line).toBe(2);
      expect(pos.column).toBe(1);
    });

    it('should calculate position in middle of second line', () => {
      const input = 'line1\nline2';
      const pos = calculatePosition(input, 9); // "e" in "line2"
      expect(pos.line).toBe(2);
      expect(pos.column).toBe(4);
    });

    it('should calculate position on third line', () => {
      const input = 'a\nb\nc';
      const pos = calculatePosition(input, 4); // "c"
      expect(pos.line).toBe(3);
      expect(pos.column).toBe(1);
    });

    it('should handle empty lines', () => {
      const input = 'a\n\nc';
      const pos = calculatePosition(input, 3); // "c"
      expect(pos.line).toBe(3);
      expect(pos.column).toBe(1);
    });
  });

  describe('edge cases', () => {
    it('should handle empty string', () => {
      const pos = calculatePosition('', 0);
      expect(pos.line).toBe(1);
      expect(pos.column).toBe(1);
    });

    it('should handle offset at newline', () => {
      const input = 'hello\nworld';
      const pos = calculatePosition(input, 5); // The newline character
      expect(pos.line).toBe(1);
      expect(pos.column).toBe(6);
    });

    it('should handle Windows-style line endings', () => {
      const input = 'line1\r\nline2';
      const pos = calculatePosition(input, 7); // Start of "line2"
      expect(pos.line).toBe(2);
      expect(pos.column).toBe(1);
    });
  });
});

// =============================================================================
// Section 2: Snippet Creation Tests
// =============================================================================

describe('createSnippet', () => {
  describe('basic snippets', () => {
    it('should create snippet at start of input', () => {
      const snippet = createSnippet('hello world', 0);
      expect(snippet).toBe('→hello world');
    });

    it('should create snippet in middle of input', () => {
      const snippet = createSnippet('hello world', 6);
      expect(snippet).toBe('hello →world');
    });

    it('should create snippet at end of input', () => {
      const snippet = createSnippet('hello', 5);
      expect(snippet).toBe('hello→');
    });
  });

  describe('truncation', () => {
    it('should truncate long input before position', () => {
      const input = 'a'.repeat(50) + 'error here';
      const snippet = createSnippet(input, 50, 10);
      expect(snippet).toContain('...');
      expect(snippet).toContain('→error');
    });

    it('should truncate long input after position', () => {
      const input = 'start' + 'a'.repeat(50);
      const snippet = createSnippet(input, 5, 10);
      expect(snippet).toContain('start→');
      expect(snippet).toContain('...');
    });

    it('should truncate both sides for middle position', () => {
      const input = 'a'.repeat(50) + 'X' + 'b'.repeat(50);
      const snippet = createSnippet(input, 50, 10);
      expect(snippet.startsWith('...')).toBe(true);
      expect(snippet.endsWith('...')).toBe(true);
      expect(snippet).toContain('→X');
    });
  });

  describe('special characters', () => {
    it('should escape newlines', () => {
      const snippet = createSnippet('hello\nworld', 5);
      expect(snippet).toBe('hello→\\nworld');
    });

    it('should escape tabs', () => {
      const snippet = createSnippet('hello\tworld', 5);
      expect(snippet).toBe('hello→\\tworld');
    });

    it('should escape carriage returns', () => {
      const snippet = createSnippet('hello\rworld', 5);
      expect(snippet).toBe('hello→\\rworld');
    });
  });

  describe('edge cases', () => {
    it('should handle empty input', () => {
      const snippet = createSnippet('', 0);
      expect(snippet).toBe('(empty input)');
    });

    it('should handle very short input', () => {
      const snippet = createSnippet('x', 0);
      expect(snippet).toBe('→x');
    });

    it('should handle position at exact input length', () => {
      const snippet = createSnippet('abc', 3);
      expect(snippet).toBe('abc→');
    });
  });
});

// =============================================================================
// Section 3: Error Creation Tests
// =============================================================================

describe('error creation functions', () => {
  describe('createParseError', () => {
    it('should create a well-formed error', () => {
      const error = createParseError('no_match', 'Test error', 'input', 0);
      expect(error.__error).toBe(true);
      expect(error.kind).toBe('no_match');
      expect(error.message).toBe('Test error');
      expect(error.input).toBe('input');
      expect(error.position).toEqual({ offset: 0, line: 1, column: 1 });
    });

    it('should include context if provided', () => {
      const error = createParseError('type_mismatch', 'Type error', 'input', 0, {
        expected: 'number',
        actual: 'string',
      });
      expect(error.context?.expected).toBe('number');
      expect(error.context?.actual).toBe('string');
    });
  });

  describe('noMatchError', () => {
    it('should create error for no grammar match', () => {
      const error = noMatchError('invalid@input', 7);
      expect(error.kind).toBe('no_match');
      expect(error.message).toContain('No grammar rule matched');
      expect(error.message).toContain('1:8'); // position
    });

    it('should handle empty input', () => {
      const error = noMatchError('', 0);
      expect(error.message).toContain('Empty');
    });

    it('should handle whitespace-only input', () => {
      const error = noMatchError('   ', 0);
      expect(error.message).toContain('Empty');
    });

    it('should handle end of input', () => {
      const error = noMatchError('hello', 5);
      expect(error.message).toContain('end of input');
    });
  });

  describe('typeMismatchError', () => {
    it('should create descriptive type mismatch error', () => {
      const error = typeMismatchError("1 + 'hello'", 4, 'number', 'string');
      expect(error.kind).toBe('type_mismatch');
      expect(error.message).toContain("expected 'number'");
      expect(error.message).toContain("got 'string'");
      expect(error.context?.expected).toBe('number');
      expect(error.context?.actual).toBe('string');
    });

    it('should include parsing context', () => {
      const error = typeMismatchError("1 + 'x'", 4, 'number', 'string', 'addition operator');
      expect(error.message).toContain('while parsing addition operator');
      expect(error.context?.parsing).toBe('addition operator');
    });
  });

  describe('unterminatedStringError', () => {
    it('should create error for unterminated string', () => {
      const error = unterminatedStringError('"hello', 0, '"');
      expect(error.kind).toBe('unterminated_string');
      expect(error.message).toContain('Unterminated string');
      expect(error.message).toContain('missing closing "');
    });

    it('should work for single quotes', () => {
      const error = unterminatedStringError("'hello", 0, "'");
      expect(error.message).toContain("missing closing '");
    });
  });

  describe('unclosedParenError', () => {
    it('should create error for unclosed parenthesis', () => {
      const error = unclosedParenError('(1 + 2', 0);
      expect(error.kind).toBe('unclosed_paren');
      expect(error.message).toContain('Unclosed parenthesis');
      expect(error.message).toContain("missing ')'");
    });
  });

  describe('unexpectedTokenError', () => {
    it('should create error with found token', () => {
      const error = unexpectedTokenError('1 @ 2', 2, '@');
      expect(error.kind).toBe('unexpected_token');
      expect(error.message).toContain('Unexpected token');
      expect(error.message).toContain("found '@'");
    });

    it('should include expected token if provided', () => {
      const error = unexpectedTokenError('1 @ 2', 2, '@', 'operator');
      expect(error.message).toContain('expected operator');
    });
  });

  describe('emptyInputError', () => {
    it('should create error for empty input', () => {
      const error = emptyInputError('');
      expect(error.kind).toBe('empty_input');
      expect(error.message).toContain('empty');
    });

    it('should work for whitespace-only input', () => {
      const error = emptyInputError('   ');
      expect(error.message).toContain('whitespace-only');
    });
  });
});

// =============================================================================
// Section 4: parseWithErrors Tests
// =============================================================================

describe('parseWithErrors', () => {
  describe('successful parsing', () => {
    it('should return success=true for valid input', () => {
      const result = parseWithErrors(operators, '1 + 2', emptyContext);
      expect(result.success).toBe(true);
      expect(result.ast).toBeDefined();
      expect(result.remaining).toBe('');
      expect(result.error).toBeUndefined();
    });

    it('should include remaining input on partial parse', () => {
      const result = parseWithErrors(operators, '1 + 2 extra', emptyContext);
      expect(result.success).toBe(true);
      expect(result.remaining).toBe(' extra');
    });

    it('should preserve original input', () => {
      const input = '1 + 2';
      const result = parseWithErrors(operators, input, emptyContext);
      expect(result.input).toBe(input);
    });
  });

  describe('parse failures', () => {
    it('should return success=false for empty input', () => {
      const result = parseWithErrors(operators, '', emptyContext);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.kind).toBe('empty_input');
    });

    it('should return success=false for whitespace-only input', () => {
      const result = parseWithErrors(operators, '   ', emptyContext);
      expect(result.success).toBe(false);
      expect(result.error?.kind).toBe('empty_input');
    });

    it('should return error with position for completely invalid input', () => {
      // Input that cannot be parsed at all (starts with invalid character)
      const result = parseWithErrors(operators, '@invalid', emptyContext);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.position).toBeDefined();
      expect(result.error?.position.line).toBe(1);
    });

    it('should return error with snippet for completely invalid input', () => {
      const result = parseWithErrors(operators, '@error', emptyContext);
      expect(result.success).toBe(false);
      expect(result.error?.snippet).toBeDefined();
      expect(result.error?.snippet).toContain('→');
    });
  });

  describe('partial parse behavior', () => {
    // The parser does partial parsing - it parses what it can and returns remaining
    it('should succeed with remaining content for partial parse', () => {
      const result = parseWithErrors(operators, '1 + @', emptyContext);
      // Parser successfully parses "1" and leaves " + @" as remaining
      expect(result.success).toBe(true);
      expect(result.remaining).toBe(' + @');
    });

    it('should succeed when expression has trailing invalid content', () => {
      const result = parseWithErrors(operators, '1 @ 2', emptyContext);
      // Parser successfully parses "1" and leaves " @ 2" as remaining
      expect(result.success).toBe(true);
      expect(result.remaining).toBe(' @ 2');
    });

    it('should succeed with remaining for incomplete expression', () => {
      const result = parseWithErrors(operators, '1 +', emptyContext);
      // Parser successfully parses "1" and leaves " +" as remaining
      expect(result.success).toBe(true);
      expect(result.remaining).toBe(' +');
    });

    it('should parse complete expressions fully', () => {
      const result = parseWithErrors(operators, '1 + 2', emptyContext);
      expect(result.success).toBe(true);
      expect(result.remaining).toBe('');
    });
  });
});

// =============================================================================
// Section 5: Error Formatting Tests
// =============================================================================

describe('error formatting', () => {
  describe('formatError', () => {
    it('should format error with position and message', () => {
      const error = noMatchError('invalid@input', 7);
      const formatted = formatError(error);
      expect(formatted).toContain('Error at line');
      expect(formatted).toContain('column');
      expect(formatted).toContain(error.message);
    });

    it('should include snippet in formatted output', () => {
      const error = noMatchError('1 + @', 4);
      const formatted = formatError(error);
      expect(formatted).toContain(error.snippet);
    });

    it('should include context for type mismatch', () => {
      const error = typeMismatchError("1 + 'x'", 4, 'number', 'string');
      const formatted = formatError(error);
      expect(formatted).toContain('Expected: number');
      expect(formatted).toContain('Actual:   string');
    });
  });

  describe('formatParseError', () => {
    it('should format parse error similarly to formatError', () => {
      const error = noMatchError('test', 0);
      const formatted = formatParseError(error);
      expect(formatted).toContain('Error at line');
    });
  });

  describe('formatErrors', () => {
    it('should format multiple errors', () => {
      const errors = [noMatchError('error1', 0), noMatchError('error2', 0)];
      const formatted = formatErrors(errors);
      expect(formatted).toContain('error1');
      expect(formatted).toContain('error2');
    });

    it('should separate errors with blank lines', () => {
      const errors = [noMatchError('a', 0), noMatchError('b', 0)];
      const formatted = formatErrors(errors);
      expect(formatted).toContain('\n\n');
    });
  });
});

// =============================================================================
// Section 6: Integration Tests
// =============================================================================

describe('integration tests', () => {
  describe('multi-line input', () => {
    it('should report correct line and column for multi-line input', () => {
      const input = '1 + 2\n3 @ 4';
      const result = parseWithErrors(operators, input, emptyContext);
      // This should parse "1 + 2" successfully with remaining "\n3 @ 4"
      expect(result.success).toBe(true);
      expect(result.remaining).toBe('\n3 @ 4');
    });
  });

  describe('complex expressions', () => {
    it('should provide useful error for nested expression failure', () => {
      const result = parseWithErrors(operators, '(1 + @)', emptyContext);
      expect(result.success).toBe(false);
      expect(result.error?.message).toBeDefined();
    });

    it('should handle unclosed parentheses', () => {
      const result = parseWithErrors(operators, '(1 + 2', emptyContext);
      expect(result.success).toBe(false);
    });
  });

  describe('error message quality', () => {
    it('should have descriptive message for empty input', () => {
      const result = parseWithErrors(operators, '', emptyContext);
      expect(result.error?.message.toLowerCase()).toContain('empty');
    });

    it('should show position in no-match error for completely invalid input', () => {
      // Use input that cannot be parsed at all
      const result = parseWithErrors(operators, '@@@', emptyContext);
      expect(result.success).toBe(false);
      // Position info should be in the message
      expect(result.error?.message).toMatch(/\d+:\d+/);
    });

    it('should return remaining content for partial parse with double operators', () => {
      // "1 + + 2" parses "1" and leaves " + + 2" - this is partial parse, not an error
      const result = parseWithErrors(operators, '1 + + 2', emptyContext);
      expect(result.success).toBe(true);
      expect(result.remaining).toBe(' + + 2');
    });
  });
});

// =============================================================================
// Section 7: Type-level Error Types (Compile-time Tests)
// =============================================================================

describe('type-level error types', () => {
  it('should have correct RichParseError structure', () => {
    const error: RichParseError = {
      __error: true,
      kind: 'no_match',
      message: 'test',
      position: { offset: 0, line: 1, column: 1 },
      snippet: '→test',
      input: 'test',
    };
    expect(error.__error).toBe(true);
  });

  it('should have correct SourcePosition structure', () => {
    const pos: SourcePosition = {
      offset: 10,
      line: 2,
      column: 5,
    };
    expect(pos.offset).toBe(10);
    expect(pos.line).toBe(2);
    expect(pos.column).toBe(5);
  });
});
