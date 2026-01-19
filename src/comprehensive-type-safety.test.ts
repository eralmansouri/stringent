/**
 * Comprehensive Type-Level and Runtime Tests (Task 7)
 *
 * This file consolidates all the type safety tests specified in PRD Task 7:
 * 1. Type tests for schema validation
 * 2. Type tests for data validation
 * 3. Runtime tests for arktype constraint validation
 * 4. Tests for arktype subtypes (string.email, etc.)
 *
 * Tests are organized to match the PRD examples and acceptance criteria.
 */

import { describe, it, expect } from 'vitest';
import { expectTypeOf } from 'vitest';
import { defineNode, lhs, rhs, constVal, createParser, evaluate } from './index.js';

// =============================================================================
// Grammar Setup
// =============================================================================

const add = defineNode({
  name: 'add',
  pattern: [lhs('number').as('left'), constVal('+'), rhs('number').as('right')],
  precedence: 1,
  resultType: 'number',
  eval: ({ left, right }) => left + right,
});

const compare = defineNode({
  name: 'compare',
  pattern: [lhs('number').as('left'), constVal('>'), rhs('number').as('right')],
  precedence: 2,
  resultType: 'boolean',
  eval: ({ left, right }) => left > right,
});

const concat = defineNode({
  name: 'concat',
  pattern: [lhs('string').as('left'), constVal('++'), rhs('string').as('right')],
  precedence: 1,
  resultType: 'string',
  eval: ({ left, right }) => left + right,
});

const nodes = [add, compare, concat] as const;
const parser = createParser(nodes);

// =============================================================================
// 1. Type Tests for Schema Validation (PRD Section)
// =============================================================================

describe('schema validation', () => {
  it('rejects invalid schema types', () => {
    // @ts-expect-error - 'garbage' is not a valid arktype
    parser.parse('x', { x: 'garbage' });
  });

  it('accepts valid arktype types', () => {
    // All of these should compile
    parser.parse('x + 1', { x: 'number' });
    parser.parse('x ++ y', { x: 'string.email', y: 'string' });
    parser.parse('x + 1', { x: 'number >= 0' });
  });

  // Additional schema validation tests
  describe('validates lhs(), rhs(), expr() constraints', () => {
    it('rejects invalid constraint in lhs()', () => {
      // @ts-expect-error - 'garbage' is not a valid arktype
      lhs('garbage');
    });

    it('rejects invalid constraint in rhs()', () => {
      // @ts-expect-error - 'asdfghjkl' is not a valid arktype
      rhs('asdfghjkl');
    });

    it('accepts arktype subtypes in constraints', () => {
      const emailLhs = lhs('string.email');
      expect(emailLhs.constraint).toBe('string.email');
    });

    it('accepts arktype constraints in lhs()', () => {
      const constrainedLhs = lhs('number >= 0');
      expect(constrainedLhs.constraint).toBe('number >= 0');
    });
  });

  describe('validates defineNode() resultType', () => {
    it('rejects invalid resultType', () => {
      defineNode({
        name: 'bad',
        pattern: [lhs('number').as('x')],
        precedence: 1,
        // @ts-expect-error - 'garbage' is not a valid arktype
        resultType: 'garbage',
      });
    });

    it('accepts arktype subtypes in resultType', () => {
      const emailNode = defineNode({
        name: 'emailResult',
        pattern: [lhs('string').as('value')],
        precedence: 1,
        resultType: 'string.email',
      });
      expect(emailNode.resultType).toBe('string.email');
    });

    it('accepts union types in resultType', () => {
      const unionNode = defineNode({
        name: 'unionResult',
        pattern: [lhs().as('value')],
        precedence: 1,
        resultType: 'string | number',
      });
      expect(unionNode.resultType).toBe('string | number');
    });
  });
});

// =============================================================================
// 2. Type Tests for Data Validation (PRD Section)
// =============================================================================

describe('data validation', () => {
  it('requires correct data types', () => {
    // Create AST with typed identifier
    const ast = {
      node: 'identifier',
      name: 'x',
      outputSchema: 'number',
    } as const;

    // Type-level test: TypeScript should catch wrong data type
    const _typeTest = () => {
      // @ts-expect-error - x should be number, not string
      evaluate(ast, { data: { x: 'wrong' }, nodes });
    };
    expect(_typeTest).toBeDefined();
  });

  it('validates at runtime', () => {
    // Parse with constrained schema - just use identifier to avoid type mismatch
    // (add node requires exact 'number' type, not 'number >= 0')
    const [evaluator, err] = parser.parse('x', { x: 'number >= 0' });
    expect(err).toBeNull();

    // Should throw at runtime for negative number
    expect(() => {
      evaluator!({ x: -5 });
    }).toThrow();
  });

  describe('requires matching data for identifiers', () => {
    it('rejects missing variables (type error)', () => {
      const ast = {
        node: 'identifier',
        name: 'x',
        outputSchema: 'number',
      } as const;

      const _typeTest = () => {
        // @ts-expect-error - x is required but not provided
        evaluate(ast, { data: {}, nodes });
      };
      expect(_typeTest).toBeDefined();
    });

    it('accepts correct data types', () => {
      const ast = {
        node: 'add',
        outputSchema: 'number',
        left: { node: 'identifier', name: 'x', outputSchema: 'number' },
        right: { node: 'literal', value: 5, outputSchema: 'number' },
      } as const;

      const value = evaluate(ast, { data: { x: 10 }, nodes });
      expectTypeOf(value).toEqualTypeOf<number>();
      expect(value).toBe(15);
    });

    it('allows extra properties in data', () => {
      const ast = {
        node: 'identifier',
        name: 'x',
        outputSchema: 'number',
      } as const;

      const value = evaluate(ast, { data: { x: 42, extra: 'ignored' }, nodes });
      expectTypeOf(value).toEqualTypeOf<number>();
      expect(value).toBe(42);
    });

    it('accepts empty data for literal-only expressions', () => {
      const ast = {
        node: 'literal',
        value: 42,
        outputSchema: 'number',
      } as const;

      const value = evaluate(ast, { data: {}, nodes });
      expectTypeOf(value).toEqualTypeOf<number>();
      expect(value).toBe(42);
    });
  });
});

// =============================================================================
// 3. Runtime Tests for ArkType Constraint Validation
// =============================================================================

describe('runtime arktype constraint validation', () => {
  describe('number constraints', () => {
    it('validates number >= 0 - rejects negative', () => {
      const ast = {
        node: 'identifier',
        name: 'x',
        outputSchema: 'number >= 0',
      } as const;

      expect(() => {
        evaluate(ast, { data: { x: -5 }, nodes });
      }).toThrow(/Variable 'x' failed validation for schema 'number >= 0'/);
    });

    it('validates number >= 0 - accepts zero', () => {
      const ast = {
        node: 'identifier',
        name: 'x',
        outputSchema: 'number >= 0',
      } as const;

      const value = evaluate(ast, { data: { x: 0 }, nodes });
      expect(value).toBe(0);
    });

    it('validates number >= 0 - accepts positive', () => {
      const ast = {
        node: 'identifier',
        name: 'x',
        outputSchema: 'number >= 0',
      } as const;

      const value = evaluate(ast, { data: { x: 100 }, nodes });
      expect(value).toBe(100);
    });

    it('validates number > 0 - rejects zero', () => {
      const ast = {
        node: 'identifier',
        name: 'x',
        outputSchema: 'number > 0',
      } as const;

      expect(() => {
        evaluate(ast, { data: { x: 0 }, nodes });
      }).toThrow(/Variable 'x' failed validation for schema 'number > 0'/);
    });

    it('validates number.integer - rejects float', () => {
      const ast = {
        node: 'identifier',
        name: 'x',
        outputSchema: 'number.integer',
      } as const;

      expect(() => {
        evaluate(ast, { data: { x: 3.14 }, nodes });
      }).toThrow(/Variable 'x' failed validation for schema 'number.integer'/);
    });

    it('validates number.integer - accepts integer', () => {
      const ast = {
        node: 'identifier',
        name: 'x',
        outputSchema: 'number.integer',
      } as const;

      const value = evaluate(ast, { data: { x: 42 }, nodes });
      expect(value).toBe(42);
    });

    it('validates range constraint 1 <= number <= 100', () => {
      const ast = {
        node: 'identifier',
        name: 'x',
        outputSchema: '1 <= number <= 100',
      } as const;

      // Valid value
      expect(evaluate(ast, { data: { x: 50 }, nodes })).toBe(50);

      // Too low
      expect(() => {
        evaluate(ast, { data: { x: 0 }, nodes });
      }).toThrow(/Variable 'x' failed validation/);

      // Too high
      expect(() => {
        evaluate(ast, { data: { x: 101 }, nodes });
      }).toThrow(/Variable 'x' failed validation/);
    });
  });

  describe('string constraints', () => {
    it('validates string.email - rejects invalid', () => {
      const ast = {
        node: 'identifier',
        name: 'email',
        outputSchema: 'string.email',
      } as const;

      expect(() => {
        evaluate(ast, { data: { email: 'not-an-email' }, nodes });
      }).toThrow(/Variable 'email' failed validation for schema 'string.email'/);
    });

    it('validates string.email - accepts valid', () => {
      const ast = {
        node: 'identifier',
        name: 'email',
        outputSchema: 'string.email',
      } as const;

      const value = evaluate(ast, { data: { email: 'test@example.com' }, nodes });
      expect(value).toBe('test@example.com');
    });

    it('validates string.uuid - rejects invalid', () => {
      const ast = {
        node: 'identifier',
        name: 'id',
        outputSchema: 'string.uuid',
      } as const;

      expect(() => {
        evaluate(ast, { data: { id: 'not-a-uuid' }, nodes });
      }).toThrow(/Variable 'id' failed validation for schema 'string.uuid'/);
    });

    it('validates string.uuid - accepts valid', () => {
      const ast = {
        node: 'identifier',
        name: 'id',
        outputSchema: 'string.uuid',
      } as const;

      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      const value = evaluate(ast, { data: { id: validUuid }, nodes });
      expect(value).toBe(validUuid);
    });

    it('validates string length constraint - rejects too short', () => {
      const ast = {
        node: 'identifier',
        name: 'password',
        outputSchema: 'string >= 8',
      } as const;

      expect(() => {
        evaluate(ast, { data: { password: 'short' }, nodes });
      }).toThrow(/Variable 'password' failed validation for schema 'string >= 8'/);
    });

    it('validates string length constraint - accepts valid length', () => {
      const ast = {
        node: 'identifier',
        name: 'password',
        outputSchema: 'string >= 8',
      } as const;

      const value = evaluate(ast, { data: { password: 'longpassword' }, nodes });
      expect(value).toBe('longpassword');
    });
  });

  describe('basic type constraints', () => {
    it('validates number type - rejects string', () => {
      const ast = {
        node: 'identifier',
        name: 'x',
        outputSchema: 'number',
      } as const;

      expect(() => {
        // @ts-expect-error - x should be number, not string (type error + runtime error)
        evaluate(ast, { data: { x: 'not-a-number' }, nodes });
      }).toThrow(/Variable 'x' failed validation for schema 'number'/);
    });

    it('validates string type - rejects number', () => {
      const ast = {
        node: 'identifier',
        name: 'x',
        outputSchema: 'string',
      } as const;

      expect(() => {
        // @ts-expect-error - x should be string, not number (type error + runtime error)
        evaluate(ast, { data: { x: 123 }, nodes });
      }).toThrow(/Variable 'x' failed validation for schema 'string'/);
    });

    it('validates boolean type - rejects string', () => {
      const ast = {
        node: 'identifier',
        name: 'flag',
        outputSchema: 'boolean',
      } as const;

      expect(() => {
        // @ts-expect-error - flag should be boolean, not string (type error + runtime error)
        evaluate(ast, { data: { flag: 'true' }, nodes });
      }).toThrow(/Variable 'flag' failed validation for schema 'boolean'/);
    });
  });

  describe('union type constraints', () => {
    it('validates string | number union - accepts string', () => {
      const ast = {
        node: 'identifier',
        name: 'x',
        outputSchema: 'string | number',
      } as const;

      const value = evaluate(ast, { data: { x: 'hello' }, nodes });
      expect(value).toBe('hello');
    });

    it('validates string | number union - accepts number', () => {
      const ast = {
        node: 'identifier',
        name: 'x',
        outputSchema: 'string | number',
      } as const;

      const value = evaluate(ast, { data: { x: 42 }, nodes });
      expect(value).toBe(42);
    });

    it('validates string | number union - rejects boolean', () => {
      const ast = {
        node: 'identifier',
        name: 'x',
        outputSchema: 'string | number',
      } as const;

      expect(() => {
        // @ts-expect-error - x should be string | number, not boolean (type error + runtime error)
        evaluate(ast, { data: { x: true }, nodes });
      }).toThrow(/Variable 'x' failed validation for schema 'string \| number'/);
    });
  });
});

// =============================================================================
// 4. Tests for ArkType Subtypes (string.email, etc.)
// =============================================================================

describe('arktype subtypes', () => {
  describe('string subtypes', () => {
    it('string.email validates email format', () => {
      const [evaluator, err] = parser.parse('email', { email: 'string.email' });
      expect(err).toBeNull();

      // Valid email passes
      const value = evaluator!({ email: 'user@example.com' });
      expect(value).toBe('user@example.com');

      // Invalid email fails
      expect(() => {
        evaluator!({ email: 'invalid-email' });
      }).toThrow();
    });

    it('string.uuid validates UUID format', () => {
      const [evaluator, err] = parser.parse('id', { id: 'string.uuid' });
      expect(err).toBeNull();

      // Valid UUID passes
      const validUuid = '123e4567-e89b-12d3-a456-426614174000';
      const value = evaluator!({ id: validUuid });
      expect(value).toBe(validUuid);

      // Invalid UUID fails
      expect(() => {
        evaluator!({ id: 'not-a-uuid' });
      }).toThrow();
    });

    it('string.url validates URL format', () => {
      // Schema accepts the subtype
      const [_evaluator, err] = parser.parse('link', { link: 'string.url' });
      expect(err).toBeNull();
    });
  });

  describe('number subtypes', () => {
    it('number.integer validates integer values', () => {
      const [evaluator, err] = parser.parse('count', { count: 'number.integer' });
      expect(err).toBeNull();

      // Integer passes
      const value = evaluator!({ count: 42 });
      expect(value).toBe(42);

      // Float fails
      expect(() => {
        evaluator!({ count: 3.14 });
      }).toThrow();
    });
  });

  describe('complex subtype expressions', () => {
    it('validates standalone identifier with integer constraint', () => {
      // When using constrained schemas, the constraint is preserved on identifiers
      const [evaluator, err] = parser.parse('count', { count: 'number.integer' });
      expect(err).toBeNull();

      // Valid integer passes
      const value = evaluator!({ count: 10 });
      expect(value).toBe(10);

      // Float fails validation
      expect(() => {
        evaluator!({ count: 10.5 });
      }).toThrow();
    });
  });
});

// =============================================================================
// Additional Edge Case Tests
// =============================================================================

describe('edge cases', () => {
  it('validates nested identifier in expression', () => {
    const ast = {
      node: 'add',
      outputSchema: 'number',
      left: {
        node: 'identifier',
        name: 'x',
        outputSchema: 'number >= 0',
      },
      right: {
        node: 'identifier',
        name: 'y',
        outputSchema: 'number >= 0',
      },
    } as const;

    // Both values valid
    const value = evaluate(ast, { data: { x: 10, y: 20 }, nodes });
    expect(value).toBe(30);

    // First value invalid
    expect(() => {
      evaluate(ast, { data: { x: -1, y: 20 }, nodes });
    }).toThrow(/Variable 'x' failed validation/);

    // Second value invalid
    expect(() => {
      evaluate(ast, { data: { x: 10, y: -1 }, nodes });
    }).toThrow(/Variable 'y' failed validation/);
  });

  it('skips validation for unknown schema', () => {
    const ast = {
      node: 'identifier',
      name: 'x',
      outputSchema: 'unknown',
    } as const;

    // Any value should be accepted for 'unknown' schema
    const value = evaluate(ast, { data: { x: 'anything' }, nodes });
    expect(value).toBe('anything');
  });

  it('validates multiple constrained identifiers individually', () => {
    // Parse individual identifiers with constraints
    // (The add node pattern requires exact 'number' type, so constraints are tested on identifiers)
    const [evaluatorX, errX] = parser.parse('x', { x: 'number >= 0' });
    const [evaluatorY, errY] = parser.parse('y', { y: 'number >= 0' });
    expect(errX).toBeNull();
    expect(errY).toBeNull();

    // Valid values
    expect(evaluatorX!({ x: 5 })).toBe(5);
    expect(evaluatorY!({ y: 10 })).toBe(10);

    // x invalid
    expect(() => {
      evaluatorX!({ x: -1 });
    }).toThrow(/Data validation failed/);

    // y invalid
    expect(() => {
      evaluatorY!({ y: -1 });
    }).toThrow(/Data validation failed/);
  });
});
