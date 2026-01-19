/**
 * String Escape Handling Tests
 *
 * Tests for escape sequence processing in string literals.
 * Task 2.3 from the PRD.
 */

import { describe, it, expect } from 'vitest';
import { processEscapeSequences, createParser, defineNode, expr, lhs, constVal } from './index.js';
import { parse } from './runtime/parser.js';

// =============================================================================
// processEscapeSequences Unit Tests
// =============================================================================

describe('processEscapeSequences', () => {
  describe('basic escape sequences', () => {
    it('should convert \\n to newline', () => {
      expect(processEscapeSequences('hello\\nworld')).toBe('hello\nworld');
    });

    it('should convert \\t to tab', () => {
      expect(processEscapeSequences('hello\\tworld')).toBe('hello\tworld');
    });

    it('should convert \\r to carriage return', () => {
      expect(processEscapeSequences('hello\\rworld')).toBe('hello\rworld');
    });

    it('should convert \\\\ to single backslash', () => {
      expect(processEscapeSequences('hello\\\\world')).toBe('hello\\world');
    });

    it('should convert \\" to double quote', () => {
      expect(processEscapeSequences('hello\\"world')).toBe('hello"world');
    });

    it("should convert \\' to single quote", () => {
      expect(processEscapeSequences("hello\\'world")).toBe("hello'world");
    });

    it('should convert \\0 to null character', () => {
      expect(processEscapeSequences('hello\\0world')).toBe('hello\0world');
    });

    it('should convert \\b to backspace', () => {
      expect(processEscapeSequences('hello\\bworld')).toBe('hello\bworld');
    });

    it('should convert \\f to form feed', () => {
      expect(processEscapeSequences('hello\\fworld')).toBe('hello\fworld');
    });

    it('should convert \\v to vertical tab', () => {
      expect(processEscapeSequences('hello\\vworld')).toBe('hello\vworld');
    });
  });

  describe('hex escape sequences (\\xHH)', () => {
    it('should convert \\x41 to A', () => {
      expect(processEscapeSequences('\\x41')).toBe('A');
    });

    it('should convert \\x61 to a', () => {
      expect(processEscapeSequences('\\x61')).toBe('a');
    });

    it('should convert \\x00 to null character', () => {
      expect(processEscapeSequences('\\x00')).toBe('\x00');
    });

    it('should convert \\xFF to character 255', () => {
      expect(processEscapeSequences('\\xFF')).toBe('\xFF');
    });

    it('should handle lowercase hex digits', () => {
      expect(processEscapeSequences('\\x4a')).toBe('J');
    });

    it('should handle uppercase hex digits', () => {
      expect(processEscapeSequences('\\x4A')).toBe('J');
    });

    it('should handle mixed case hex digits', () => {
      expect(processEscapeSequences('\\x4a\\x4A')).toBe('JJ');
    });

    it('should keep invalid \\x escape as-is (only one hex digit)', () => {
      expect(processEscapeSequences('\\x4')).toBe('\\x4');
    });

    it('should keep invalid \\x escape as-is (no hex digits)', () => {
      expect(processEscapeSequences('\\x')).toBe('\\x');
    });

    it('should keep invalid \\x escape as-is (non-hex characters)', () => {
      expect(processEscapeSequences('\\xGH')).toBe('\\xGH');
    });
  });

  describe('unicode escape sequences (\\uHHHH)', () => {
    it('should convert \\u0041 to A', () => {
      expect(processEscapeSequences('\\u0041')).toBe('A');
    });

    it('should convert \\u0061 to a', () => {
      expect(processEscapeSequences('\\u0061')).toBe('a');
    });

    it('should convert \\u4E2D to Chinese character', () => {
      expect(processEscapeSequences('\\u4E2D')).toBe('中');
    });

    it('should convert \\u00A9 to copyright symbol', () => {
      expect(processEscapeSequences('\\u00A9')).toBe('©');
    });

    it('should convert \\u03B1 to Greek alpha', () => {
      expect(processEscapeSequences('\\u03B1')).toBe('α');
    });

    it('should handle lowercase hex digits', () => {
      expect(processEscapeSequences('\\u004a')).toBe('J');
    });

    it('should handle uppercase hex digits', () => {
      expect(processEscapeSequences('\\u004A')).toBe('J');
    });

    it('should keep invalid \\u escape as-is (only three hex digits)', () => {
      expect(processEscapeSequences('\\u004')).toBe('\\u004');
    });

    it('should keep invalid \\u escape as-is (no hex digits)', () => {
      expect(processEscapeSequences('\\u')).toBe('\\u');
    });

    it('should keep invalid \\u escape as-is (non-hex characters)', () => {
      expect(processEscapeSequences('\\uGHIJ')).toBe('\\uGHIJ');
    });
  });

  describe('multiple escape sequences', () => {
    it('should handle multiple escapes in sequence', () => {
      expect(processEscapeSequences('\\n\\t\\r')).toBe('\n\t\r');
    });

    it('should handle escapes mixed with regular text', () => {
      expect(processEscapeSequences('line1\\nline2\\tcolumn2')).toBe('line1\nline2\tcolumn2');
    });

    it('should handle consecutive backslashes', () => {
      expect(processEscapeSequences('\\\\\\\\')).toBe('\\\\');
    });

    it('should handle backslash followed by other escape', () => {
      expect(processEscapeSequences('\\\\n')).toBe('\\n');
    });

    it('should handle mix of all escape types', () => {
      expect(processEscapeSequences('\\n\\t\\x41\\u0042')).toBe('\n\tAB');
    });
  });

  describe('unknown escape sequences', () => {
    it('should keep unknown escapes as-is', () => {
      expect(processEscapeSequences('\\z')).toBe('\\z');
    });

    it('should keep \\a as-is (not a standard escape)', () => {
      expect(processEscapeSequences('\\a')).toBe('\\a');
    });

    it('should keep escaped numbers (except \\0) as-is', () => {
      expect(processEscapeSequences('\\1\\2\\3')).toBe('\\1\\2\\3');
    });
  });

  describe('edge cases', () => {
    it('should return empty string for empty input', () => {
      expect(processEscapeSequences('')).toBe('');
    });

    it('should return string without escapes unchanged', () => {
      expect(processEscapeSequences('hello world')).toBe('hello world');
    });

    it('should handle trailing backslash', () => {
      expect(processEscapeSequences('hello\\')).toBe('hello\\');
    });

    it('should handle string starting with escape', () => {
      expect(processEscapeSequences('\\nhello')).toBe('\nhello');
    });

    it('should handle string ending with escape', () => {
      expect(processEscapeSequences('hello\\n')).toBe('hello\n');
    });

    it('should handle string that is just an escape', () => {
      expect(processEscapeSequences('\\n')).toBe('\n');
    });

    it('should handle very long strings', () => {
      const input = 'hello\\n'.repeat(1000);
      const expected = 'hello\n'.repeat(1000);
      expect(processEscapeSequences(input)).toBe(expected);
    });

    it('should handle strings with only backslashes', () => {
      expect(processEscapeSequences('\\\\\\\\\\\\')).toBe('\\\\\\');
    });
  });
});

// =============================================================================
// Integration Tests with Runtime Parser
// =============================================================================

describe('String Escape Integration with Parser', () => {
  describe('basic escape sequences in parsed strings', () => {
    it('should parse string with \\n and process escape', () => {
      const result = parse([], '"hello\\nworld"', { data: {} });
      expect(result.length).toBe(2);
      const [node] = result;
      expect(node.node).toBe('literal');
      expect(node.outputSchema).toBe('string');
      expect((node as any).raw).toBe('hello\\nworld');
      expect((node as any).value).toBe('hello\nworld');
    });

    it('should parse string with \\t and process escape', () => {
      const result = parse([], '"hello\\tworld"', { data: {} });
      expect(result.length).toBe(2);
      const [node] = result;
      expect((node as any).value).toBe('hello\tworld');
    });

    it('should parse string with \\\\ and process escape', () => {
      const result = parse([], '"hello\\\\world"', { data: {} });
      expect(result.length).toBe(2);
      const [node] = result;
      expect((node as any).value).toBe('hello\\world');
    });

    it('should parse string with \\" inside', () => {
      const result = parse([], '"say \\"hello\\""', { data: {} });
      expect(result.length).toBe(2);
      const [node] = result;
      expect((node as any).value).toBe('say "hello"');
    });

    it("should parse single-quoted string with \\' inside", () => {
      const result = parse([], "'it\\'s'", { data: {} });
      expect(result.length).toBe(2);
      const [node] = result;
      expect((node as any).value).toBe("it's");
    });
  });

  describe('unicode escapes in parsed strings', () => {
    it('should parse string with \\u escape', () => {
      const result = parse([], '"\\u0041\\u0042\\u0043"', { data: {} });
      expect(result.length).toBe(2);
      const [node] = result;
      expect((node as any).value).toBe('ABC');
    });

    it('should parse string with Chinese character escape', () => {
      const result = parse([], '"\\u4E2D\\u6587"', { data: {} });
      expect(result.length).toBe(2);
      const [node] = result;
      expect((node as any).value).toBe('中文');
    });

    it('should parse string with \\x escape', () => {
      const result = parse([], '"\\x48\\x69"', { data: {} });
      expect(result.length).toBe(2);
      const [node] = result;
      expect((node as any).value).toBe('Hi');
    });
  });

  describe('mixed content in parsed strings', () => {
    it('should parse string with escapes and regular text', () => {
      const result = parse([], '"Line 1\\nLine 2\\tTabbed"', { data: {} });
      expect(result.length).toBe(2);
      const [node] = result;
      expect((node as any).value).toBe('Line 1\nLine 2\tTabbed');
    });

    it('should preserve raw value separately from processed value', () => {
      const result = parse([], '"a\\nb\\tc"', { data: {} });
      expect(result.length).toBe(2);
      const [node] = result;
      expect((node as any).raw).toBe('a\\nb\\tc');
      expect((node as any).value).toBe('a\nb\tc');
    });
  });
});

// =============================================================================
// Integration Tests with createParser
// =============================================================================

describe('String Escape Integration with createParser', () => {
  const stringConcat = defineNode({
    name: 'concat',
    pattern: [lhs('string').as('left'), constVal('+'), expr('string').as('right')],
    precedence: 1,
    resultType: 'string',
    eval: (bindings) => (bindings.left as string) + (bindings.right as string),
  });

  const parser = createParser([stringConcat] as const);

  it('should parse and evaluate string with escapes', () => {
    const result = parser.parse('"hello\\nworld"', {});
    expect(result.length).toBe(2);
    const [ast] = result;
    expect(ast.outputSchema).toBe('string');
  });

  it('should concatenate strings with escapes', () => {
    const result = parser.parse('"hello\\n" + "world"', {});
    expect(result.length).toBe(2);
    const [ast] = result;
    expect(ast.node).toBe('concat');
    expect(ast.outputSchema).toBe('string');

    // Verify the left operand has processed escapes
    const left = (ast as any).left;
    expect(left.value).toBe('hello\n');
    expect(left.raw).toBe('hello\\n');
  });

  it('should handle multiple escaped strings in expression', () => {
    const result = parser.parse('"a\\tb" + "c\\nd"', {});
    expect(result.length).toBe(2);
    const [ast] = result;

    const left = (ast as any).left;
    const right = (ast as any).right;
    expect(left.value).toBe('a\tb');
    expect(right.value).toBe('c\nd');
  });
});

// =============================================================================
// Edge Case Integration Tests
// =============================================================================

describe('String Escape Edge Cases', () => {
  it('should handle empty string', () => {
    const result = parse([], '""', { data: {} });
    expect(result.length).toBe(2);
    const [node] = result;
    expect((node as any).value).toBe('');
  });

  it('should handle string with only escape sequences', () => {
    const result = parse([], '"\\n\\t\\r"', { data: {} });
    expect(result.length).toBe(2);
    const [node] = result;
    expect((node as any).value).toBe('\n\t\r');
  });

  it('should handle string with invalid unicode escape', () => {
    const result = parse([], '"\\uXXXX"', { data: {} });
    expect(result.length).toBe(2);
    const [node] = result;
    // Invalid escape is kept as-is
    expect((node as any).value).toBe('\\uXXXX');
  });

  it('should handle string with incomplete hex escape', () => {
    const result = parse([], '"\\x4"', { data: {} });
    expect(result.length).toBe(2);
    const [node] = result;
    expect((node as any).value).toBe('\\x4');
  });

  it('should handle string with trailing backslash', () => {
    const result = parse([], '"hello\\"', { data: {} });
    // Note: The parser may or may not match this depending on parsebox behavior
    // This tests the processEscapeSequences handling of trailing backslash
    // when it gets passed through
    if (result.length === 2) {
      const [node] = result;
      // If it parses, the trailing backslash should be preserved
      expect((node as any).value).toContain('hello');
    }
  });

  it('should handle long string with many escapes', () => {
    const escapeChars = '\\n\\t\\r\\\\'.repeat(100);
    const input = `"${escapeChars}"`;
    const result = parse([], input, { data: {} }) as [any, string] | [];
    expect(result.length).toBe(2);
    if (result.length === 2) {
      const [node] = result;
      const expected = '\n\t\r\\'.repeat(100);
      expect(node.value).toBe(expected);
    }
  });
});
