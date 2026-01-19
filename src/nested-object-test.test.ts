/**
 * Test file to verify nested object schema support
 * Task 11: Support Nested Object Schemas
 */
import { describe, it, expect, expectTypeOf } from 'vitest';
import { type } from 'arktype';
import { createParser } from './createParser.js';
import { defineNode, ident } from './schema/index.js';

describe('nested object schemas (Task 11)', () => {
  // First, verify arktype itself supports nested objects
  describe('arktype nested object support', () => {
    it('type() accepts nested object schemas', () => {
      const nestedType = type({ x: { y: 'boolean' } });
      type NestedInfer = typeof nestedType.infer;

      // Verify the inferred type is correct
      expectTypeOf<NestedInfer>().toEqualTypeOf<{ x: { y: boolean } }>();

      // Verify runtime validation works
      const valid = nestedType({ x: { y: true } });
      expect(valid).toEqual({ x: { y: true } });

      const invalid = nestedType({ x: { y: 'not a boolean' } });
      expect(invalid instanceof type.errors).toBe(true);
    });

    it('type.validate accepts nested object schemas in generic functions', () => {
      function createValidator<const T>(schema: type.validate<T>) {
        return type(schema as never);
      }

      // This should compile - valid nested object schema
      const validator = createValidator({ name: 'string', nested: { value: 'number' } });

      // Verify it works at runtime
      const result = validator({ name: 'test', nested: { value: 42 } });
      expect(result).toEqual({ name: 'test', nested: { value: 42 } });
    });
  });

  // Now verify our parser supports nested object schemas
  describe('parser.parse() with nested object schemas', () => {
    // Create a simple parser with an identifier node
    const identNode = defineNode({
      name: 'ident',
      pattern: [ident().as('name')],
      precedence: 0,
      resultType: 'unknown',
      eval: ({ name }, ctx) => (ctx as { data: Record<string, unknown> }).data[name as string],
    });

    const parser = createParser([identNode] as const);

    it('accepts nested object in schema', () => {
      // This should compile without errors
      const [evaluator, err] = parser.parse('user', { user: { name: 'string', age: 'number' } });
      expect(err).toBeNull();
      expect(evaluator!.ast).toBeDefined();
    });

    it('rejects invalid nested schema values', () => {
      // @ts-expect-error - 'garbage' is not a valid arktype type
      parser.parse('user', { user: { name: 'garbage' } });
    });

    it('accepts deeply nested schemas', () => {
      // This should compile
      const [evaluator, err] = parser.parse('data', {
        data: {
          level1: {
            level2: {
              value: 'boolean',
            },
          },
        },
      });
      expect(err).toBeNull();
      expect(evaluator!.ast).toBeDefined();
    });

    it('rejects invalid types in deeply nested schemas', () => {
      parser.parse('data', {
        data: {
          level1: {
            level2: {
              // @ts-expect-error - 'invalid' is not a valid arktype type
              value: 'invalid',
            },
          },
        },
      });
    });

    it('accepts mixed flat and nested schemas', () => {
      // This should compile - mix of flat and nested values
      const [evaluator, err] = parser.parse('x', {
        x: 'number',
        user: { name: 'string', age: 'number' },
      });
      expect(err).toBeNull();
      expect(evaluator!.ast).toBeDefined();
    });
  });
});
