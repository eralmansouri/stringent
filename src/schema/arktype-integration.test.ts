/**
 * ArkType Integration Tests - Task 2
 *
 * Tests that SchemaToType correctly uses arktype's type.infer to:
 * 1. Map primitive types: 'number', 'string', 'boolean', 'null', 'undefined'
 * 2. Map subtypes: 'string.email', 'number.integer' → base type
 * 3. Map constraints: 'number >= 0' → base type
 * 4. Map unions: 'string | number' → union type
 *
 * NOTE: Validation of invalid type strings (like 'garbage') is handled by
 * lhs(), rhs(), expr(), and parser.parse() in Tasks 3-5.
 */

import { describe, it, expectTypeOf } from 'vitest';
import { type SchemaToType, type ArkTypeSchemaToType, type ValidArkType } from './index.js';

describe('ArkType Integration - Task 2', () => {
  describe('SchemaToType - Primitive Types', () => {
    it('maps "number" to number', () => {
      type Result = SchemaToType<'number'>;
      expectTypeOf<Result>().toEqualTypeOf<number>();
    });

    it('maps "string" to string', () => {
      type Result = SchemaToType<'string'>;
      expectTypeOf<Result>().toEqualTypeOf<string>();
    });

    it('maps "boolean" to boolean', () => {
      type Result = SchemaToType<'boolean'>;
      expectTypeOf<Result>().toEqualTypeOf<boolean>();
    });

    it('maps "null" to null', () => {
      type Result = SchemaToType<'null'>;
      expectTypeOf<Result>().toEqualTypeOf<null>();
    });

    it('maps "undefined" to undefined', () => {
      type Result = SchemaToType<'undefined'>;
      expectTypeOf<Result>().toEqualTypeOf<undefined>();
    });
  });

  describe('SchemaToType - ArkType Subtypes', () => {
    it('maps "string.email" to string (subtype)', () => {
      type Result = SchemaToType<'string.email'>;
      expectTypeOf<Result>().toEqualTypeOf<string>();
    });

    it('maps "number.integer" to number (subtype)', () => {
      type Result = SchemaToType<'number.integer'>;
      expectTypeOf<Result>().toEqualTypeOf<number>();
    });

    it('maps "string.uuid" to string (subtype)', () => {
      type Result = SchemaToType<'string.uuid'>;
      expectTypeOf<Result>().toEqualTypeOf<string>();
    });

    it('maps "string.url" to string (subtype)', () => {
      type Result = SchemaToType<'string.url'>;
      expectTypeOf<Result>().toEqualTypeOf<string>();
    });
  });

  describe('SchemaToType - ArkType Constraints', () => {
    it('maps "number >= 0" to number (constrained)', () => {
      type Result = SchemaToType<'number >= 0'>;
      expectTypeOf<Result>().toEqualTypeOf<number>();
    });

    it('maps "number > 0" to number (constrained)', () => {
      type Result = SchemaToType<'number > 0'>;
      expectTypeOf<Result>().toEqualTypeOf<number>();
    });

    it('maps "number.integer >= 0" to number (constrained subtype)', () => {
      type Result = SchemaToType<'number.integer >= 0'>;
      expectTypeOf<Result>().toEqualTypeOf<number>();
    });

    it('maps "string >= 8" (length constraint) to string', () => {
      type Result = SchemaToType<'string >= 8'>;
      expectTypeOf<Result>().toEqualTypeOf<string>();
    });
  });

  describe('SchemaToType - Union Types', () => {
    it('maps "string | number" to string | number', () => {
      type Result = SchemaToType<'string | number'>;
      expectTypeOf<Result>().toEqualTypeOf<string | number>();
    });

    it('maps "boolean | number" to boolean | number', () => {
      type Result = SchemaToType<'boolean | number'>;
      expectTypeOf<Result>().toEqualTypeOf<boolean | number>();
    });

    it('maps "string | number | boolean" to string | number | boolean', () => {
      type Result = SchemaToType<'string | number | boolean'>;
      expectTypeOf<Result>().toEqualTypeOf<string | number | boolean>();
    });

    it('maps "null | undefined" to null | undefined', () => {
      type Result = SchemaToType<'null | undefined'>;
      expectTypeOf<Result>().toEqualTypeOf<null | undefined>();
    });
  });

  describe('ArkTypeSchemaToType - Direct arktype.infer (no fallback)', () => {
    it('maps primitives correctly', () => {
      type NumberResult = ArkTypeSchemaToType<'number'>;
      type StringResult = ArkTypeSchemaToType<'string'>;
      expectTypeOf<NumberResult>().toEqualTypeOf<number>();
      expectTypeOf<StringResult>().toEqualTypeOf<string>();
    });

    it('maps subtypes correctly', () => {
      type Result = ArkTypeSchemaToType<'string.email'>;
      expectTypeOf<Result>().toEqualTypeOf<string>();
    });

    it('maps constraints correctly', () => {
      type Result = ArkTypeSchemaToType<'number >= 0'>;
      expectTypeOf<Result>().toEqualTypeOf<number>();
    });

    it('maps unions correctly', () => {
      type Result = ArkTypeSchemaToType<'string | number'>;
      expectTypeOf<Result>().toEqualTypeOf<string | number>();
    });

    it('returns never for invalid types (no fallback)', () => {
      // ArkTypeSchemaToType doesn't have fallback - returns never for invalid
      type InvalidResult = ArkTypeSchemaToType<'garbage'>;
      expectTypeOf<InvalidResult>().toEqualTypeOf<never>();
    });
  });

  describe('ValidArkType - Compile-Time Validation', () => {
    it('accepts valid primitive types', () => {
      // These should all compile without errors
      type NumberValidation = ValidArkType<'number'>;
      type StringValidation = ValidArkType<'string'>;
      type BooleanValidation = ValidArkType<'boolean'>;
      type NullValidation = ValidArkType<'null'>;
      type UndefinedValidation = ValidArkType<'undefined'>;

      // ValidArkType returns the validated type (not a boolean)
      // For valid types, it should return the type string itself
      expectTypeOf<NumberValidation>().toEqualTypeOf<'number'>();
      expectTypeOf<StringValidation>().toEqualTypeOf<'string'>();
      expectTypeOf<BooleanValidation>().toEqualTypeOf<'boolean'>();
      expectTypeOf<NullValidation>().toEqualTypeOf<'null'>();
      expectTypeOf<UndefinedValidation>().toEqualTypeOf<'undefined'>();
    });

    it('accepts valid subtype strings', () => {
      type EmailValidation = ValidArkType<'string.email'>;
      type IntegerValidation = ValidArkType<'number.integer'>;

      expectTypeOf<EmailValidation>().toEqualTypeOf<'string.email'>();
      expectTypeOf<IntegerValidation>().toEqualTypeOf<'number.integer'>();
    });

    it('accepts valid constraint strings', () => {
      type NonNegValidation = ValidArkType<'number >= 0'>;
      type PositiveValidation = ValidArkType<'number > 0'>;

      expectTypeOf<NonNegValidation>().toEqualTypeOf<'number >= 0'>();
      expectTypeOf<PositiveValidation>().toEqualTypeOf<'number > 0'>();
    });

    it('accepts valid union strings', () => {
      type UnionValidation = ValidArkType<'string | number'>;
      expectTypeOf<UnionValidation>().toEqualTypeOf<'string | number'>();
    });
  });

  describe('SchemaToType - Edge Cases', () => {
    it('handles array types', () => {
      type Result = SchemaToType<'string[]'>;
      expectTypeOf<Result>().toEqualTypeOf<string[]>();
    });

    it('handles number arrays', () => {
      type Result = SchemaToType<'number[]'>;
      expectTypeOf<Result>().toEqualTypeOf<number[]>();
    });

    it('handles union arrays', () => {
      type Result = SchemaToType<'(string | number)[]'>;
      expectTypeOf<Result>().toEqualTypeOf<(string | number)[]>();
    });
  });

  describe('SchemaToType - Fallback Behavior', () => {
    it('falls back to unknown for invalid type strings', () => {
      // SchemaToType has fallback to unknown for invalid types
      type InvalidResult = SchemaToType<'garbage'>;
      expectTypeOf<InvalidResult>().toEqualTypeOf<unknown>();
    });

    it('falls back to unknown for completely invalid strings', () => {
      type Result = SchemaToType<'asdfghjkl'>;
      expectTypeOf<Result>().toEqualTypeOf<unknown>();
    });

    it('handles the "unknown" type correctly (not a fallback)', () => {
      // "unknown" is a valid arktype type string, so it should resolve normally
      type Result = SchemaToType<'unknown'>;
      expectTypeOf<Result>().toEqualTypeOf<unknown>();
    });
  });
});
