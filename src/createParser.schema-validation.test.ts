/**
 * Tests for parser.parse() Schema Validation (Task 5)
 *
 * Verifies that schema values in parser.parse() are validated at compile time
 * using arktype. Invalid type strings like 'garbage' should cause TypeScript errors.
 */

import { describe, it, expect } from 'vitest';
import { defineNode, lhs, rhs, constVal, createParser } from './index.js';

// =============================================================================
// Grammar Setup
// =============================================================================

const add = defineNode({
  name: 'add',
  pattern: [lhs('number').as('left'), constVal('+'), rhs('number').as('right')],
  precedence: 1,
  resultType: 'number',
});

const concat = defineNode({
  name: 'concat',
  pattern: [lhs('string').as('left'), constVal('++'), rhs('string').as('right')],
  precedence: 1,
  resultType: 'string',
});

const operators = [add, concat] as const;
const parser = createParser(operators);

// =============================================================================
// Schema Validation - Valid Types (should compile)
// =============================================================================

describe('parser.parse() schema validation - valid types', () => {
  describe('accepts primitive type strings', () => {
    it('accepts number schema', () => {
      const [evaluator, err] = parser.parse('x + 1', { x: 'number' });
      expect(err).toBeNull();
      expect(evaluator!.ast).toMatchObject({ node: 'add' });
    });

    it('accepts string schema', () => {
      const [evaluator, err] = parser.parse('x ++ y', { x: 'string', y: 'string' });
      expect(err).toBeNull();
      expect(evaluator!.ast).toMatchObject({ node: 'concat' });
    });

    it('accepts boolean schema', () => {
      // Note: booleans aren't used in our grammar, but the type should be valid
      const [_evaluator, err] = parser.parse('42', { flag: 'boolean' });
      expect(err).toBeNull();
    });

    it('accepts null schema', () => {
      const [_evaluator, err] = parser.parse('42', { nullable: 'null' });
      expect(err).toBeNull();
    });

    it('accepts undefined schema', () => {
      const [_evaluator, err] = parser.parse('42', { opt: 'undefined' });
      expect(err).toBeNull();
    });
  });

  describe('accepts arktype subtypes', () => {
    it('accepts string.email', () => {
      const [_evaluator, err] = parser.parse('42', { email: 'string.email' });
      expect(err).toBeNull();
    });

    it('accepts number.integer', () => {
      const [_evaluator, err] = parser.parse('42', { count: 'number.integer' });
      expect(err).toBeNull();
    });

    it('accepts string.uuid', () => {
      const [_evaluator, err] = parser.parse('42', { id: 'string.uuid' });
      expect(err).toBeNull();
    });

    it('accepts string.url', () => {
      const [_evaluator, err] = parser.parse('42', { link: 'string.url' });
      expect(err).toBeNull();
    });
  });

  describe('accepts arktype constraints', () => {
    it('accepts number >= 0', () => {
      // Type validation passes (no compile error)
      // Runtime parses the expression with constrained type in schema
      const [evaluator, err] = parser.parse('42', { x: 'number >= 0' });
      expect(err).toBeNull();
      expect(evaluator!.ast).toMatchObject({ node: 'literal', value: 42 });
    });

    it('accepts number > 0', () => {
      const [_evaluator, err] = parser.parse('42', { x: 'number > 0' });
      expect(err).toBeNull();
    });

    it('accepts 1 <= number <= 100', () => {
      const [_evaluator, err] = parser.parse('42', { x: '1 <= number <= 100' });
      expect(err).toBeNull();
    });

    it('accepts string >= 8 (length constraint)', () => {
      const [_evaluator, err] = parser.parse('42', { password: 'string >= 8' });
      expect(err).toBeNull();
    });
  });

  describe('accepts union types', () => {
    it('accepts string | number', () => {
      const [_evaluator, err] = parser.parse('42', { mixed: 'string | number' });
      expect(err).toBeNull();
    });

    it('accepts string | number | boolean', () => {
      const [_evaluator, err] = parser.parse('42', { any: 'string | number | boolean' });
      expect(err).toBeNull();
    });

    it('accepts null | string', () => {
      const [_evaluator, err] = parser.parse('42', { nullable: 'null | string' });
      expect(err).toBeNull();
    });
  });

  describe('accepts array types', () => {
    it('accepts string[]', () => {
      const [_evaluator, err] = parser.parse('42', { items: 'string[]' });
      expect(err).toBeNull();
    });

    it('accepts number[]', () => {
      const [_evaluator, err] = parser.parse('42', { nums: 'number[]' });
      expect(err).toBeNull();
    });
  });

  describe('accepts other valid types', () => {
    it('accepts Date', () => {
      const [_evaluator, err] = parser.parse('42', { created: 'Date' });
      expect(err).toBeNull();
    });

    it('accepts bigint', () => {
      const [_evaluator, err] = parser.parse('42', { big: 'bigint' });
      expect(err).toBeNull();
    });

    it('accepts symbol', () => {
      const [_evaluator, err] = parser.parse('42', { sym: 'symbol' });
      expect(err).toBeNull();
    });

    it('accepts unknown', () => {
      const [_evaluator, err] = parser.parse('42', { any: 'unknown' });
      expect(err).toBeNull();
    });
  });

  describe('accepts empty schema', () => {
    it('accepts empty schema object', () => {
      const [evaluator, err] = parser.parse('42', {});
      expect(err).toBeNull();
      expect(evaluator!.ast).toMatchObject({ node: 'literal', value: 42 });
    });
  });

  describe('accepts multiple schema entries', () => {
    it('accepts multiple valid entries', () => {
      const [evaluator, err] = parser.parse('x + y', {
        x: 'number',
        y: 'number',
        extra: 'string.email',
        count: 'number >= 0',
      });
      expect(err).toBeNull();
      expect(evaluator!.ast).toMatchObject({ node: 'add' });
    });
  });
});

// =============================================================================
// Schema Validation - Invalid Types (type errors)
// =============================================================================

describe('parser.parse() schema validation - invalid types (type errors)', () => {
  it('rejects garbage type string', () => {
    // @ts-expect-error - 'garbage' is not a valid arktype type string
    parser.parse('x + 1', { x: 'garbage' });
  });

  it('rejects asdfghjkl type string', () => {
    // @ts-expect-error - 'asdfghjkl' is not a valid arktype type string
    parser.parse('x + 1', { x: 'asdfghjkl' });
  });

  it('rejects misspelled number', () => {
    // @ts-expect-error - 'nubmer' is not a valid arktype type string
    parser.parse('x + 1', { x: 'nubmer' });
  });

  it('rejects misspelled string', () => {
    // @ts-expect-error - 'strng' is not a valid arktype type string
    parser.parse('x + 1', { x: 'strng' });
  });

  it('rejects invalid subtype', () => {
    // @ts-expect-error - 'string.invalid' is not a valid arktype subtype
    parser.parse('42', { email: 'string.invalid' });
  });

  it('rejects invalid constraint syntax', () => {
    // @ts-expect-error - 'number >> 0' is not valid constraint syntax
    parser.parse('42', { x: 'number >> 0' });
  });

  it('rejects random text', () => {
    // @ts-expect-error - 'hello world' is not a valid type
    parser.parse('42', { msg: 'hello world' });
  });

  it('rejects partially invalid schema', () => {
    // @ts-expect-error - mixed valid and invalid: 'invalid' is not a valid type
    parser.parse('x + 1', { x: 'number', y: 'invalid' });
  });
});

// =============================================================================
// Type Preservation Tests
// =============================================================================

describe('parser.parse() schema type preservation', () => {
  it('preserves literal schema types', () => {
    // This test verifies that the schema types are preserved
    // The implementation uses ValidatedSchema which should maintain the exact types
    const schema = { x: 'number', y: 'string.email' } as const;
    const [_evaluator, err] = parser.parse('x + 1', schema);
    expect(err).toBeNull();
  });

  it('works with as const assertions', () => {
    const [evaluator, err] = parser.parse('x + 1', { x: 'number' } as const);
    expect(err).toBeNull();
    expect(evaluator!.ast).toMatchObject({ node: 'add' });
  });
});
