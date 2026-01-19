/**
 * Error Handling Tests
 *
 * Comprehensive tests for error handling in the parser:
 * - Invalid syntax errors (malformed expressions)
 * - Type mismatch errors (constraint violations)
 * - No-match errors (unknown operators)
 * - Error message quality
 * - Error recovery behavior
 */

import { describe, it, expect } from 'vitest';
import { parse } from './runtime/parser.js';
import { infer } from './runtime/infer.js';
import { defineNode, lhs, rhs, expr, constVal } from './schema/index.js';
import type { Context } from './context.js';
import type { ComputeGrammar } from './grammar/index.js';
import type { Parse, ParseError, TypeMismatchError, NoMatchError } from './parse/index.js';
// Type imports for type-level tests - StringNode would be used if we had type-level constraint tests
import { typeCheck, type AssertEqual, type AssertExtends } from './test-helpers.js';

// =============================================================================
// Test Helpers
// =============================================================================

const emptyContext: Context = { data: {} };

function contextWith(data: Record<string, string>): Context {
  return { data };
}

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

const stringConcat = defineNode({
  name: 'concat',
  pattern: [lhs('string').as('left'), constVal('++'), rhs('string').as('right')],
  precedence: 1,
  resultType: 'string',
});

const comparison = defineNode({
  name: 'eq',
  pattern: [lhs().as('left'), constVal('=='), rhs().as('right')],
  precedence: 0,
  resultType: 'boolean',
});

const _operators = [add, mul, stringConcat, comparison] as const;
type Grammar = ComputeGrammar<typeof _operators>;
type Ctx = Context<{ x: 'number'; y: 'string'; a: 'number'; b: 'number' }>;

// =============================================================================
// Section 1: Invalid Syntax Errors (Malformed Expressions)
// =============================================================================

describe('invalid syntax errors', () => {
  describe('malformed numbers', () => {
    it('should fail on multiple decimal points', () => {
      const result = parse([], '1.2.3', emptyContext);
      // Parses "1.2" successfully, leaves ".3" as remaining
      expect(result.length).toBe(2);
      expect(result[1]).toBe('.3');
    });

    it('should fail on number starting with letter', () => {
      // "a123" parses as identifier, not number
      const result = parse([], 'a123', emptyContext);
      expect(result.length).toBe(2);
      expect(result[0]).toMatchObject({
        node: 'identifier',
        name: 'a123',
      });
    });

    it('should fail on just decimal point', () => {
      // Just "." is invalid
      const result = parse([], '.', emptyContext);
      expect(result.length).toBe(0);
    });
  });

  describe('malformed strings', () => {
    it('should fail on unterminated double-quoted string', () => {
      const result = parse([], '"unterminated', emptyContext);
      expect(result.length).toBe(0);
    });

    it('should fail on unterminated single-quoted string', () => {
      const result = parse([], "'unterminated", emptyContext);
      expect(result.length).toBe(0);
    });

    it('should fail on empty unterminated string', () => {
      const result = parse([], '"', emptyContext);
      expect(result.length).toBe(0);
    });

    it('should fail on mismatched quotes', () => {
      // Starts with " but ends with '
      const result = parse([], '"mismatched\'', emptyContext);
      expect(result.length).toBe(0);
    });
  });

  describe('malformed parentheses', () => {
    it('should fail on unclosed parenthesis', () => {
      const result = parse([], '(42', emptyContext);
      expect(result.length).toBe(0);
    });

    it('should fail on empty parentheses', () => {
      const result = parse([], '()', emptyContext);
      expect(result.length).toBe(0);
    });

    it('should fail on multiple unclosed parentheses', () => {
      const result = parse([], '((42', emptyContext);
      expect(result.length).toBe(0);
    });

    it('should fail on mismatched nesting', () => {
      const result = parse([], '((42)', emptyContext);
      expect(result.length).toBe(0);
    });

    it('should fail on nested empty parentheses', () => {
      const result = parse([], '(())', emptyContext);
      expect(result.length).toBe(0);
    });

    it('should leave extra closing parens as remaining', () => {
      const result = parse([], '42)', emptyContext);
      expect(result.length).toBe(2);
      expect(result[1]).toBe(')');
    });

    it('should fail on parentheses containing only whitespace', () => {
      const result = parse([], '(   )', emptyContext);
      expect(result.length).toBe(0);
    });
  });

  describe('malformed operators', () => {
    it('should leave operator-only input unparsed when no operands', () => {
      const result = parse([add], '+', emptyContext);
      expect(result.length).toBe(0);
    });

    it('should leave trailing operator as remaining', () => {
      const result = parse([add], '1+', emptyContext);
      // Should parse "1" and leave "+" as remaining
      expect(result.length).toBe(2);
      expect(result[0]).toMatchObject({ node: 'literal', value: 1 });
      expect(result[1]).toBe('+');
    });

    it('should fail on double operators', () => {
      const result = parse([add], '1++2', emptyContext);
      // First + is the concat operator if stringConcat is defined, otherwise
      // just parse 1 and leave ++2
      expect(result.length).toBe(2);
      expect(result[1]).toBe('++2');
    });

    it('should fail on operator at start', () => {
      const result = parse([add], '+1', emptyContext);
      expect(result.length).toBe(0);
    });
  });

  describe('invalid characters', () => {
    it('should fail on @ at start', () => {
      const result = parse([], '@', emptyContext);
      expect(result.length).toBe(0);
    });

    it('should fail on # at start', () => {
      const result = parse([], '#', emptyContext);
      expect(result.length).toBe(0);
    });

    it('should fail on backtick strings', () => {
      const result = parse([], '`template`', emptyContext);
      expect(result.length).toBe(0);
    });

    it('should fail on curly braces', () => {
      const result = parse([], '{}', emptyContext);
      expect(result.length).toBe(0);
    });

    it('should fail on square brackets', () => {
      const result = parse([], '[]', emptyContext);
      expect(result.length).toBe(0);
    });
  });
});

// =============================================================================
// Section 2: Type Mismatch Errors (Constraint Violations)
// =============================================================================

describe('type mismatch errors', () => {
  describe('lhs constraint violations', () => {
    it('should not match number operator with string lhs', () => {
      // add expects number on lhs, but "hello" is a string
      const result = parse([add], '"hello"+1', emptyContext);
      expect(result.length).toBe(2);
      // Parses string literal, leaves +1 as remaining
      expect(result[0]).toMatchObject({
        node: 'literal',
        outputSchema: 'string',
      });
      expect(result[1]).toBe('+1');
    });

    it('should not match string operator with number lhs', () => {
      // stringConcat expects string on lhs, but 1 is a number
      const result = parse([stringConcat], '1++2', emptyContext);
      expect(result.length).toBe(2);
      expect(result[0]).toMatchObject({
        node: 'literal',
        outputSchema: 'number',
        value: 1,
      });
      expect(result[1]).toBe('++2');
    });

    it('should use context type for identifier constraint checking', () => {
      const numOp = defineNode({
        name: 'numOp',
        pattern: [lhs('number').as('left'), constVal('@@'), rhs('number').as('right')],
        precedence: 1,
        resultType: 'number',
      });

      // x is string in context, so number constraint fails
      const ctx = contextWith({ x: 'string' });
      const result = parse([numOp], 'x@@1', ctx);
      expect(result.length).toBe(2);
      expect(result[0]).toMatchObject({
        node: 'identifier',
        name: 'x',
        outputSchema: 'string',
      });
      expect(result[1]).toBe('@@1');
    });
  });

  describe('rhs constraint violations', () => {
    it('should not match number operator with string rhs', () => {
      // add expects number on rhs, but "world" is a string
      const result = parse([add], '1+"world"', emptyContext);
      expect(result.length).toBe(2);
      // Parses 1, leaves +"world" as remaining
      expect(result[0]).toMatchObject({
        node: 'literal',
        value: 1,
      });
      expect(result[1]).toBe('+"world"');
    });

    it('should not match string operator with number rhs', () => {
      // stringConcat expects string on rhs, but 2 is a number
      const result = parse([stringConcat], '"hello"++2', emptyContext);
      expect(result.length).toBe(2);
      expect(result[0]).toMatchObject({
        node: 'literal',
        outputSchema: 'string',
      });
      expect(result[1]).toBe('++2');
    });
  });

  describe('expr constraint violations', () => {
    it('should not match when expr constraint fails in middle position', () => {
      const ternary = defineNode({
        name: 'ternary',
        pattern: [
          lhs().as('cond'),
          constVal('?'),
          expr('number').as('then'),
          constVal(':'),
          expr('number').as('else'),
        ],
        precedence: 0,
        resultType: 'number',
      });

      // "then" branch must be number, but "hello" is string
      // Use "cond" as an identifier (not "true" which is now a boolean literal)
      const result = parse([ternary], 'cond?"hello":1', contextWith({ cond: 'boolean' }));
      expect(result.length).toBe(2);
      // Falls back to parsing identifier "cond"
      expect(result[0]).toMatchObject({
        node: 'identifier',
        name: 'cond',
      });
    });
  });

  describe('constraint with unknown types', () => {
    it('should not match constraint when identifier is unknown', () => {
      // When identifier type is unknown, it cannot satisfy "number" constraint
      const numOp = defineNode({
        name: 'numOp',
        pattern: [lhs('number').as('left'), constVal('%%'), rhs('number').as('right')],
        precedence: 1,
        resultType: 'number',
      });

      // "foo" has unknown type, so cannot satisfy "number"
      const result = parse([numOp], 'foo%%1', emptyContext);
      expect(result.length).toBe(2);
      expect(result[0]).toMatchObject({
        node: 'identifier',
        name: 'foo',
        outputSchema: 'unknown',
      });
      expect(result[1]).toBe('%%1');
    });
  });

  describe('type-level type mismatch tests', () => {
    it('should verify type constraint violation at runtime returns partial parse', () => {
      // String cannot be used with + which requires numbers
      // Falls back to parsing just the string literal
      const result = parse([add], '"hello"+1', emptyContext);
      expect(result.length).toBe(2);
      expect(result[0]).toMatchObject({
        node: 'literal',
        outputSchema: 'string',
        raw: 'hello',
      });
      expect(result[1]).toBe('+1');
    });

    it('TypeMismatchError should have correct message format', () => {
      type Err = TypeMismatchError<'number', 'string'>;
      type T1 = AssertExtends<Err, ParseError>;
      typeCheck<T1>(true);

      type T2 = AssertEqual<Err['message'], 'Type mismatch: expected number, got string'>;
      typeCheck<T2>(true);
    });
  });
});

// =============================================================================
// Section 3: No-Match Errors (Unknown Operators)
// =============================================================================

describe('no-match errors', () => {
  describe('unknown operators at runtime', () => {
    it('should leave unknown operator as remaining', () => {
      // @ is not a defined operator
      const result = parse([add], '1@2', emptyContext);
      expect(result.length).toBe(2);
      expect(result[0]).toMatchObject({ value: 1 });
      expect(result[1]).toBe('@2');
    });

    it('should leave undefined multi-char operator as remaining', () => {
      // <> is not a defined operator
      const result = parse([add], '1<>2', emptyContext);
      expect(result.length).toBe(2);
      expect(result[1]).toBe('<>2');
    });

    it('should handle when no grammar rules exist', () => {
      // No operators defined, but atoms should still work
      const result = parse([], 'hello', emptyContext);
      expect(result.length).toBe(2);
      expect(result[0]).toMatchObject({
        node: 'identifier',
        name: 'hello',
      });
    });
  });

  describe('empty and whitespace input', () => {
    it('should return empty for empty input', () => {
      const result = parse([], '', emptyContext);
      expect(result.length).toBe(0);
    });

    it('should return empty for whitespace-only input', () => {
      const result = parse([], '   ', emptyContext);
      expect(result.length).toBe(0);
    });

    it('should return empty for newlines-only input', () => {
      const result = parse([], '\n\n\n', emptyContext);
      expect(result.length).toBe(0);
    });

    it('should return empty for tabs-only input', () => {
      const result = parse([], '\t\t\t', emptyContext);
      expect(result.length).toBe(0);
    });

    it('should return empty for mixed whitespace-only input', () => {
      const result = parse([], '  \t\n  \t\n  ', emptyContext);
      expect(result.length).toBe(0);
    });
  });

  describe('type-level no-match tests', () => {
    it("should return empty tuple when input doesn't match any rule", () => {
      type Result = Parse<Grammar, '@invalid', Ctx>;
      type T1 = AssertEqual<Result, []>;
      typeCheck<T1>(true);
    });

    it('should return empty tuple for empty input', () => {
      type Result = Parse<Grammar, '', Ctx>;
      type T1 = AssertEqual<Result, []>;
      typeCheck<T1>(true);
    });

    it('NoMatchError should have correct format', () => {
      type Err = NoMatchError;
      type T1 = AssertExtends<Err, ParseError>;
      typeCheck<T1>(true);

      type T2 = AssertEqual<Err['message'], 'No grammar rule matched'>;
      typeCheck<T2>(true);
    });
  });
});

// =============================================================================
// Section 4: Error Messages and infer() Errors
// =============================================================================

describe('error messages and infer() errors', () => {
  describe('infer() with invalid AST', () => {
    it('should throw on null AST', () => {
      expect(() => infer(null, emptyContext)).toThrow('Invalid AST node: null');
    });

    it('should throw on undefined AST', () => {
      expect(() => infer(undefined, emptyContext)).toThrow('Invalid AST node: undefined');
    });

    it('should throw on primitive number', () => {
      expect(() => infer(42, emptyContext)).toThrow('Invalid AST node: 42');
    });

    it('should throw on primitive string', () => {
      expect(() => infer('hello', emptyContext)).toThrow('Invalid AST node: hello');
    });

    it('should throw on primitive boolean', () => {
      expect(() => infer(true, emptyContext)).toThrow('Invalid AST node: true');
    });

    it('should throw on object without outputSchema', () => {
      expect(() => infer({ foo: 'bar' }, emptyContext)).toThrow(
        'AST node has no outputSchema: {"foo":"bar"}'
      );
    });

    it('should throw on empty object', () => {
      expect(() => infer({}, emptyContext)).toThrow('AST node has no outputSchema: {}');
    });

    it('should throw on object with non-string outputSchema', () => {
      expect(() => infer({ outputSchema: 123 }, emptyContext)).toThrow(
        'AST node has no outputSchema: {"outputSchema":123}'
      );
    });

    it('should throw on array', () => {
      expect(() => infer([1, 2, 3], emptyContext)).toThrow('AST node has no outputSchema: [1,2,3]');
    });
  });

  describe('infer() with valid AST', () => {
    it('should return outputSchema for literal node', () => {
      const result = parse([], '42', emptyContext);
      expect(result.length).toBe(2);
      const type = infer(result[0], emptyContext);
      expect(type).toBe('number');
    });

    it('should return outputSchema for string literal', () => {
      const result = parse([], '"hello"', emptyContext);
      expect(result.length).toBe(2);
      const type = infer(result[0], emptyContext);
      expect(type).toBe('string');
    });

    it('should return outputSchema for identifier', () => {
      const ctx = contextWith({ x: 'number' });
      const result = parse([], 'x', ctx);
      expect(result.length).toBe(2);
      const type = infer(result[0], ctx);
      expect(type).toBe('number');
    });

    it('should return outputSchema for binary operation', () => {
      const result = parse([add], '1+2', emptyContext);
      expect(result.length).toBe(2);
      const type = infer(result[0], emptyContext);
      expect(type).toBe('number');
    });

    it('should return outputSchema for nested operation', () => {
      const result = parse([add, mul], '1+2*3', emptyContext);
      expect(result.length).toBe(2);
      const type = infer(result[0], emptyContext);
      expect(type).toBe('number');
    });
  });

  describe('ParseError type structure', () => {
    it('should have __error marker', () => {
      type Err = ParseError<'test message'>;
      type T1 = AssertEqual<Err['__error'], true>;
      typeCheck<T1>(true);
    });

    it('should have message property', () => {
      type Err = ParseError<'custom error'>;
      type T1 = AssertEqual<Err['message'], 'custom error'>;
      typeCheck<T1>(true);
    });
  });
});

// =============================================================================
// Section 5: Error Recovery Behavior
// =============================================================================

describe('error recovery behavior', () => {
  describe('partial parsing (backtracking)', () => {
    it('should parse valid prefix and leave invalid suffix as remaining', () => {
      const result = parse([], '123abc@#$', emptyContext);
      expect(result.length).toBe(2);
      expect(result[0]).toMatchObject({ value: 123 });
      expect(result[1]).toBe('abc@#$');
    });

    it('should parse complete valid token when followed by invalid', () => {
      const result = parse([], 'hello@world', emptyContext);
      expect(result.length).toBe(2);
      expect(result[0]).toMatchObject({
        node: 'identifier',
        name: 'hello',
      });
      expect(result[1]).toBe('@world');
    });

    it('should try multiple operators via backtracking', () => {
      // Create operators with same symbol but different constraints
      const numOp = defineNode({
        name: 'numPlus',
        pattern: [lhs('number').as('left'), constVal('+'), rhs('number').as('right')],
        precedence: 1,
        resultType: 'number',
      });

      const strOp = defineNode({
        name: 'strPlus',
        pattern: [lhs('string').as('left'), constVal('+'), rhs('string').as('right')],
        precedence: 1,
        resultType: 'string',
      });

      // Number + Number should match numOp
      const result1 = parse([numOp, strOp], '1+2', emptyContext);
      expect(result1.length).toBe(2);
      expect((result1[0] as any).node).toBe('numPlus');

      // String + String should match strOp (numOp constraint fails, falls through)
      const result2 = parse([numOp, strOp], '"a"+"b"', emptyContext);
      expect(result2.length).toBe(2);
      expect((result2[0] as any).node).toBe('strPlus');
    });
  });

  describe('fallback to atoms on operator failure', () => {
    it('should fallback to number atom when operator constraint fails', () => {
      const result = parse([stringConcat], '42', emptyContext);
      expect(result.length).toBe(2);
      expect(result[0]).toMatchObject({
        node: 'literal',
        value: 42,
        outputSchema: 'number',
      });
    });

    it('should fallback to string atom when operator constraint fails', () => {
      const result = parse([add], '"hello"', emptyContext);
      expect(result.length).toBe(2);
      expect(result[0]).toMatchObject({
        node: 'literal',
        outputSchema: 'string',
      });
    });

    it('should fallback to identifier when no operator matches', () => {
      const result = parse([add], 'foo', emptyContext);
      expect(result.length).toBe(2);
      expect(result[0]).toMatchObject({
        node: 'identifier',
        name: 'foo',
      });
    });
  });

  describe('parentheses recovery', () => {
    it('should consume valid content in parentheses even if outer fails', () => {
      // "(1+2" - inner expression valid but paren unclosed
      const result = parse([add], '(1+2', emptyContext);
      expect(result.length).toBe(0);
    });

    it('should parse valid parenthesized expression with trailing content', () => {
      const result = parse([add], '(1+2)@@@', emptyContext);
      expect(result.length).toBe(2);
      expect((result[0] as any).node).toBe('parentheses');
      expect(result[1]).toBe('@@@');
    });
  });

  describe('multiple failure modes', () => {
    it('should report remaining input correctly after partial parse', () => {
      // Multiple issues: 1 parses, then "+" with no rhs
      const result = parse([add], '1+', emptyContext);
      expect(result.length).toBe(2);
      expect(result[0]).toMatchObject({ value: 1 });
      expect(result[1]).toBe('+');
    });

    it('should handle mixed valid/invalid sequences', () => {
      const result = parse([add], '1 + @ + 2', emptyContext);
      // Should parse "1", leave " + @ + 2" because rhs "@" is invalid
      expect(result.length).toBe(2);
      expect(result[0]).toMatchObject({ value: 1 });
      expect(result[1]).toBe(' + @ + 2');
    });
  });

  describe('whitespace handling in error cases', () => {
    it('should handle leading whitespace before invalid input', () => {
      const result = parse([], '   @invalid', emptyContext);
      expect(result.length).toBe(0);
    });

    it('should preserve trailing whitespace in remaining after partial parse', () => {
      const result = parse([], '42   @@@', emptyContext);
      expect(result.length).toBe(2);
      expect(result[1]).toBe('   @@@');
    });
  });
});

// =============================================================================
// Section 6: Edge Cases in Error Handling
// =============================================================================

describe('edge cases in error handling', () => {
  describe('boundary conditions', () => {
    it('should handle single character inputs', () => {
      expect(parse([], 'a', emptyContext).length).toBe(2);
      expect(parse([], '1', emptyContext).length).toBe(2);
      expect(parse([], '@', emptyContext).length).toBe(0);
      expect(parse([], ' ', emptyContext).length).toBe(0);
    });

    it('should handle extremely long valid input', () => {
      const longNumber = '9'.repeat(1000);
      // Use any to bypass TypeScript's literal inference for dynamic strings
      const result: unknown[] = parse([], longNumber as string, emptyContext);
      expect(result.length).toBe(2);
      expect(result[0]).toMatchObject({ node: 'literal' });
    });

    it('should handle extremely long invalid input', () => {
      const longInvalid = '@'.repeat(1000);
      const result: unknown[] = parse([], longInvalid as string, emptyContext);
      expect(result.length).toBe(0);
    });
  });

  describe('special string contents', () => {
    it('should handle string with special characters inside', () => {
      const result = parse([], '"hello@#$%^&*()world"', emptyContext);
      expect(result.length).toBe(2);
      expect(result[0]).toMatchObject({
        node: 'literal',
        outputSchema: 'string',
        raw: 'hello@#$%^&*()world',
      });
    });

    it('should handle string with parentheses inside', () => {
      const result = parse([], '"(nested)"', emptyContext);
      expect(result.length).toBe(2);
      expect(result[0]).toMatchObject({
        raw: '(nested)',
      });
    });

    it('should handle string with operators inside', () => {
      const result = parse([add], '"1+2"', emptyContext);
      expect(result.length).toBe(2);
      expect(result[0]).toMatchObject({
        raw: '1+2',
        outputSchema: 'string',
      });
    });
  });

  describe('context-based error scenarios', () => {
    it('should handle empty context data', () => {
      const result = parse([add], 'x+y', { data: {} });
      expect(result.length).toBe(2);
      // x and y have unknown type, add requires number, so operator doesn't match
      expect(result[0]).toMatchObject({
        node: 'identifier',
        name: 'x',
        outputSchema: 'unknown',
      });
    });

    it('should handle partial context data', () => {
      const ctx = contextWith({ x: 'number' }); // y is not defined
      const result = parse([add], 'x+y', ctx);
      // x is number, y is unknown; rhs constraint for "number" fails on unknown
      expect(result.length).toBe(2);
      expect(result[0]).toMatchObject({
        node: 'identifier',
        name: 'x',
        outputSchema: 'number',
      });
      expect(result[1]).toBe('+y');
    });
  });
});
