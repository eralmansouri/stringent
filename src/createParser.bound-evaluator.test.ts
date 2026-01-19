/**
 * Tests for Task 12: Parser Returns Bound Evaluator
 *
 * Verifies that:
 * 1. parser.parse() returns [Evaluator, null] on success
 * 2. parser.parse() returns [null, Error] on failure
 * 3. Evaluator has ast property
 * 4. Evaluator has schema property
 * 5. Evaluator is callable with data matching schema
 * 6. Evaluator validates data at runtime
 * 7. Evaluator return type is inferred from outputSchema
 */

import { describe, it, expect, expectTypeOf } from 'vitest';
import { createParser, defineNode, lhs, rhs, constVal, expr } from './index.js';

// =============================================================================
// Test Grammar
// =============================================================================

const add = defineNode({
  name: 'add',
  pattern: [lhs('number').as('left'), constVal('+'), rhs('number').as('right')],
  precedence: 1,
  resultType: 'number',
  eval: ({ left, right }) => left + right,
});

const mul = defineNode({
  name: 'mul',
  pattern: [lhs('number').as('left'), constVal('*'), rhs('number').as('right')],
  precedence: 2,
  resultType: 'number',
  eval: ({ left, right }) => left * right,
});

const concat = defineNode({
  name: 'concat',
  pattern: [lhs('string').as('left'), constVal('++'), rhs('string').as('right')],
  precedence: 1,
  resultType: 'string',
  eval: ({ left, right }) => left + right,
});

const eq = defineNode({
  name: 'eq',
  pattern: [lhs().as('left'), constVal('=='), rhs().as('right')],
  precedence: 0,
  resultType: 'boolean',
  eval: ({ left, right }) => left === right,
});

const ternary = defineNode({
  name: 'ternary',
  pattern: [
    lhs('boolean').as('condition'),
    constVal('?'),
    expr().as('then'),
    constVal(':'),
    rhs().as('else'),
  ],
  precedence: 0,
  resultType: { union: ['then', 'else'] } as const,
  eval: ({ condition, then: thenVal, else: elseVal }) => (condition ? thenVal : elseVal),
});

const nodes = [add, mul, concat, eq, ternary] as const;
const parser = createParser(nodes);

// =============================================================================
// Basic API Tests
// =============================================================================

describe('Task 12 - Parser Returns Bound Evaluator', () => {
  describe('parse() return type', () => {
    it('returns [evaluator, null] on success', () => {
      const [evaluator, err] = parser.parse('1 + 2', {});
      expect(err).toBeNull();
      expect(evaluator).not.toBeNull();
      expect(typeof evaluator).toBe('function');
    });

    it('returns [null, error] on parse failure', () => {
      // @ts-expect-error - intentionally testing invalid input
      const [evaluator, err] = parser.parse('invalid @@@ expression', {});
      expect(evaluator).toBeNull();
      expect(err).toBeInstanceOf(Error);
    });
  });

  describe('evaluator properties', () => {
    it('evaluator has ast property', () => {
      const [evaluator, err] = parser.parse('1 + 2', {});
      expect(err).toBeNull();
      expect(evaluator).not.toBeNull();
      expect(evaluator!.ast).toBeDefined();
      expect(evaluator!.ast.node).toBe('add');
    });

    it('evaluator has schema property', () => {
      const [evaluator, err] = parser.parse('x + y', { x: 'number', y: 'number' });
      expect(err).toBeNull();
      expect(evaluator).not.toBeNull();
      expect(evaluator!.schema).toEqual({ x: 'number', y: 'number' });
    });
  });

  describe('evaluator call signature', () => {
    it('evaluator is callable with data', () => {
      const [evaluator, err] = parser.parse('x + 1', { x: 'number' });
      expect(err).toBeNull();
      expect(evaluator).not.toBeNull();
      const value = evaluator!({ x: 5 });
      expect(value).toBe(6);
    });

    it('evaluator evaluates literal expressions with empty data', () => {
      const [evaluator, err] = parser.parse('1 + 2 * 3', {});
      expect(err).toBeNull();
      expect(evaluator).not.toBeNull();
      const value = evaluator!({});
      expect(value).toBe(7);
    });

    it('evaluator evaluates string concatenation', () => {
      const [evaluator, err] = parser.parse('x ++ y', { x: 'string', y: 'string' });
      expect(err).toBeNull();
      expect(evaluator).not.toBeNull();
      const value = evaluator!({ x: 'hello', y: 'world' });
      expect(value).toBe('helloworld');
    });

    it('evaluator evaluates comparison', () => {
      const [evaluator, err] = parser.parse('x == y', { x: 'number', y: 'number' });
      expect(err).toBeNull();
      expect(evaluator).not.toBeNull();
      const value = evaluator!({ x: 5, y: 5 });
      expect(value).toBe(true);
    });

    it('evaluator evaluates ternary', () => {
      const [evaluator, err] = parser.parse('x ? 1 : 2', { x: 'boolean' });
      expect(err).toBeNull();
      expect(evaluator).not.toBeNull();
      expect(evaluator!({ x: true })).toBe(1);
      expect(evaluator!({ x: false })).toBe(2);
    });
  });
});

// =============================================================================
// Type Safety Tests
// =============================================================================

describe('Task 12 - Type Safety', () => {
  describe('data type inference', () => {
    it('infers correct data type for number schema', () => {
      const [evaluator] = parser.parse('x + y', { x: 'number', y: 'number' });
      if (evaluator) {
        // TypeScript should infer data as { x: number; y: number }
        expectTypeOf(evaluator).toBeCallableWith({ x: 1, y: 2 });
      }
    });

    it('infers correct data type for string schema', () => {
      const [evaluator] = parser.parse('x ++ y', { x: 'string', y: 'string' });
      if (evaluator) {
        // TypeScript should infer data as { x: string; y: string }
        expectTypeOf(evaluator).toBeCallableWith({ x: 'a', y: 'b' });
      }
    });

    it('allows empty data for literal-only expressions', () => {
      const [evaluator] = parser.parse('1 + 2', {});
      if (evaluator) {
        // Should accept empty object
        expectTypeOf(evaluator).toBeCallableWith({});
      }
    });
  });

  describe('return type inference', () => {
    it('infers number return type for add expression', () => {
      const [evaluator] = parser.parse('1 + 2', {});
      if (evaluator) {
        const result = evaluator({});
        expectTypeOf(result).toEqualTypeOf<number>();
      }
    });

    it('infers string return type for concat expression', () => {
      const [evaluator] = parser.parse('"hello" ++ "world"', {});
      if (evaluator) {
        const result = evaluator({});
        expectTypeOf(result).toEqualTypeOf<string>();
      }
    });

    it('infers boolean return type for comparison expression', () => {
      const [evaluator] = parser.parse('1 == 2', {});
      if (evaluator) {
        const result = evaluator({});
        expectTypeOf(result).toEqualTypeOf<boolean>();
      }
    });
  });

  describe('ast type preservation', () => {
    it('preserves ast outputSchema type', () => {
      const [evaluator] = parser.parse('1 + 2', {});
      if (evaluator) {
        expectTypeOf(evaluator.ast.outputSchema).toEqualTypeOf<'number'>();
      }
    });

    it('preserves ast node type', () => {
      const [evaluator] = parser.parse('1 + 2', {});
      if (evaluator) {
        expectTypeOf(evaluator.ast.node).toEqualTypeOf<'add'>();
      }
    });
  });
});

// =============================================================================
// Runtime Validation Tests
// =============================================================================

describe('Task 12 - Runtime Validation', () => {
  describe('data validation', () => {
    it('throws when data is missing required fields', () => {
      const [evaluator] = parser.parse('x + y', { x: 'number', y: 'number' });
      expect(evaluator).not.toBeNull();
      expect(() => {
        // @ts-expect-error - intentionally missing y
        evaluator!({ x: 5 });
      }).toThrow();
    });

    it('throws when data has wrong type', () => {
      const [evaluator] = parser.parse('x + 1', { x: 'number' });
      expect(evaluator).not.toBeNull();
      expect(() => {
        // @ts-expect-error - intentionally wrong type
        evaluator!({ x: 'not a number' });
      }).toThrow();
    });

    it('validates arktype constraints at runtime', () => {
      // Create a parser that accepts any number constraint
      const addAny = defineNode({
        name: 'addAny',
        pattern: [lhs().as('left'), constVal('+'), rhs().as('right')],
        precedence: 1,
        resultType: 'number',
        eval: ({ left, right }) => (left as number) + (right as number),
      });
      const constraintParser = createParser([addAny] as const);

      const [evaluator] = constraintParser.parse('x + 1', { x: 'number >= 0' });
      expect(evaluator).not.toBeNull();
      // Valid value
      expect(evaluator!({ x: 5 })).toBe(6);
      // Invalid value - negative number
      expect(() => evaluator!({ x: -5 })).toThrow();
    });

    it('validates string subtypes at runtime', () => {
      // Create a parser that accepts any string constraint
      const concatAny = defineNode({
        name: 'concatAny',
        pattern: [lhs().as('left'), constVal('++'), rhs().as('right')],
        precedence: 1,
        resultType: 'string',
        eval: ({ left, right }) => String(left) + String(right),
      });
      const constraintParser = createParser([concatAny] as const);

      const [evaluator] = constraintParser.parse('x ++ "!"', { x: 'string.email' });
      expect(evaluator).not.toBeNull();
      // Valid email
      expect(evaluator!({ x: 'test@example.com' })).toBe('test@example.com!');
      // Invalid email
      expect(() => evaluator!({ x: 'not-an-email' })).toThrow();
    });
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('Task 12 - Edge Cases', () => {
  it('handles deeply nested expressions', () => {
    const [evaluator, err] = parser.parse('(1 + 2) * (3 + 4)', {});
    expect(err).toBeNull();
    expect(evaluator).not.toBeNull();
    expect(evaluator!({})).toBe(21);
  });

  it('handles complex expressions with variables', () => {
    const [evaluator, err] = parser.parse('x * (y + 1)', { x: 'number', y: 'number' });
    expect(err).toBeNull();
    expect(evaluator).not.toBeNull();
    expect(evaluator!({ x: 3, y: 4 })).toBe(15);
  });

  it('preserves schema for multiple evaluations', () => {
    const [evaluator, err] = parser.parse('x + y', { x: 'number', y: 'number' });
    expect(err).toBeNull();
    expect(evaluator).not.toBeNull();

    // Multiple evaluations with different data
    expect(evaluator!({ x: 1, y: 2 })).toBe(3);
    expect(evaluator!({ x: 10, y: 20 })).toBe(30);
    expect(evaluator!({ x: -5, y: 5 })).toBe(0);

    // Schema is preserved
    expect(evaluator!.schema).toEqual({ x: 'number', y: 'number' });
  });
});
