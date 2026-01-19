/**
 * ArkType Research Tests
 *
 * Task 1: Study ArkType Integration
 *
 * This file investigates how arktype can be used to:
 * 1. Validate type strings at compile time
 * 2. Infer TypeScript types from type strings
 * 3. Validate values at runtime
 */

import { describe, it, expect, expectTypeOf } from 'vitest';
import { type } from 'arktype';

describe('ArkType Research - Task 1', () => {
  describe('Question 1: How does arktype generic validation work?', () => {
    it('type() creates a validator from a type string', () => {
      // The type() function accepts a type string and returns a Type object
      const numberValidator = type('number');

      // The Type object has an infer property for extracting the TypeScript type
      type NumberType = typeof numberValidator.infer;

      // Verify the inferred type is number
      expectTypeOf<NumberType>().toEqualTypeOf<number>();

      // Runtime validation
      const result = numberValidator(42);
      expect(result).toBe(42);
    });

    it('type() supports primitives', () => {
      const _str = type('string');
      const _num = type('number');
      const _bool = type('boolean');
      const _nil = type('null');
      const _undef = type('undefined');

      type Str = typeof _str.infer;
      type Num = typeof _num.infer;
      type Bool = typeof _bool.infer;
      type Nil = typeof _nil.infer;
      type Undef = typeof _undef.infer;

      expectTypeOf<Str>().toEqualTypeOf<string>();
      expectTypeOf<Num>().toEqualTypeOf<number>();
      expectTypeOf<Bool>().toEqualTypeOf<boolean>();
      expectTypeOf<Nil>().toEqualTypeOf<null>();
      expectTypeOf<Undef>().toEqualTypeOf<undefined>();
    });

    it('type() supports unions', () => {
      const union = type('string | number');
      type Union = typeof union.infer;
      expectTypeOf<Union>().toEqualTypeOf<string | number>();

      expect(union('hello')).toBe('hello');
      expect(union(42)).toBe(42);
    });

    it('type() supports subtypes like string.email', () => {
      // string.email is a subtype that validates email format
      const email = type('string.email');
      type Email = typeof email.infer;

      // The inferred type is still string (the base type)
      expectTypeOf<Email>().toEqualTypeOf<string>();

      // But runtime validates the email format
      const validResult = email('test@example.com');
      expect(validResult).toBe('test@example.com');

      // Invalid email returns an ArkErrors object (instanceof type.errors)
      const invalidResult = email('not-an-email');
      expect(invalidResult instanceof type.errors).toBe(true);
    });

    it('type() supports constraints like number >= 0', () => {
      const nonNegative = type('number >= 0');
      type NonNeg = typeof nonNegative.infer;

      // The inferred type is still number
      expectTypeOf<NonNeg>().toEqualTypeOf<number>();

      // Runtime validates the constraint
      expect(nonNegative(5)).toBe(5);
      expect(nonNegative(0)).toBe(0);

      // Negative numbers fail validation
      const negResult = nonNegative(-1);
      expect(negResult instanceof type.errors).toBe(true);
    });

    it('type() supports integer constraints', () => {
      const integer = type('number.integer');
      type Int = typeof integer.infer;

      expectTypeOf<Int>().toEqualTypeOf<number>();

      expect(integer(42)).toBe(42);

      const floatResult = integer(3.14);
      expect(floatResult instanceof type.errors).toBe(true);
    });
  });

  describe('Question 2: How to validate type strings at compile time?', () => {
    it('invalid type strings cause compile-time errors', () => {
      // This demonstrates that arktype validates type strings at compile time
      // Uncommenting the following line would cause a TypeScript error:
      // const invalid = type('garbage'); // Error: 'garbage' is not a valid type

      // Valid types compile fine:
      const valid = type('string');
      expect(valid('hello')).toBe('hello');
    });

    it('type.validate<T> can be used in generic functions', () => {
      // The type.validate<T> utility validates that a type definition is valid
      // This is used in generic functions to ensure type safety

      // Direct usage - type() directly validates at compile time
      // type('garbage') would cause a compile error

      // Valid types work
      const numType = type('number');
      expect(numType(42)).toBe(42);

      // For generic functions, use type.validate<T>:
      // function fn<const T>(schema: type.validate<T>) { ... }
      // This causes compile errors for invalid type strings like 'garbage'
    });
  });

  describe('Question 3: How does type.infer work?', () => {
    it('type.infer extracts TypeScript type from definition', () => {
      // After creating a type, use .infer to get the TypeScript type
      const userType = type({
        name: 'string',
        age: 'number >= 0',
      });

      type User = typeof userType.infer;

      // User is equivalent to { name: string; age: number }
      const user: User = { name: 'Alice', age: 30 };
      expect(userType(user)).toEqual(user);
    });

    it('type.infer works with complex types', () => {
      const complexType = type({
        items: '(string | number)[]',
        'optional?': 'boolean',
      });

      type Complex = typeof complexType.infer;

      const value: Complex = { items: ['a', 1, 'b', 2] };
      expect(complexType(value)).toEqual(value);
    });
  });

  describe('Question 4: What types should Stringent support initially?', () => {
    it('supports basic primitives that Stringent needs', () => {
      // Stringent needs these basic types:
      const types = {
        number: type('number'),
        string: type('string'),
        boolean: type('boolean'),
        null: type('null'),
        undefined: type('undefined'),
      };

      // All should work
      expect(types.number(42)).toBe(42);
      expect(types.string('hello')).toBe('hello');
      expect(types.boolean(true)).toBe(true);
      expect(types.null(null)).toBe(null);
      expect(types.undefined(undefined)).toBe(undefined);
    });

    it('supports unions for ternary result types', () => {
      // Ternary can return different types from each branch
      const boolOrNum = type('boolean | number');

      expect(boolOrNum(true)).toBe(true);
      expect(boolOrNum(42)).toBe(42);
    });

    it('supports constraints for advanced use cases', () => {
      // Users may want to constrain their schema types
      const positiveInt = type('number.integer > 0');

      expect(positiveInt(1)).toBe(1);
      expect(positiveInt(100)).toBe(100);

      // Invalid values return ArkErrors
      expect(positiveInt(0) instanceof type.errors).toBe(true);
      expect(positiveInt(-1) instanceof type.errors).toBe(true);
      expect(positiveInt(3.14) instanceof type.errors).toBe(true);
    });
  });

  describe('Integration pattern for Stringent', () => {
    it('demonstrates how to use type.validate in schema factories', () => {
      // This is how lhs(), rhs(), expr() should validate constraints

      // Direct validation - type() validates at compile time
      const numValidator = type('number');
      expect(numValidator(42)).toBe(42);

      // The pattern for schema factories:
      // export const lhs = <const T extends string>(constraint?: type.validate<T>) => ...
      // This will reject invalid type strings like 'garbage' at compile time

      // For testing, we demonstrate that valid constraints work:
      const emailValidator = type('string.email');
      expect(emailValidator('test@example.com')).toBe('test@example.com');

      const constrainedNum = type('number >= 0');
      expect(constrainedNum(5)).toBe(5);
    });

    it('demonstrates type inference from constraint strings', () => {
      // Direct type inference works - creating types directly preserves the type
      const _numValidator = type('number');
      type NumType = typeof _numValidator.infer;
      expectTypeOf<NumType>().toEqualTypeOf<number>();

      const _strValidator = type('string');
      type StrType = typeof _strValidator.infer;
      expectTypeOf<StrType>().toEqualTypeOf<string>();

      const _unionValidator = type('string | number');
      type UnionType = typeof _unionValidator.infer;
      expectTypeOf<UnionType>().toEqualTypeOf<string | number>();

      // Note: When using type.validate in generics, the return type inference
      // can be lost due to TypeScript limitations. The approach for Stringent's
      // SchemaToType will need to work around this - possibly by using
      // type.infer<def> directly if available, or maintaining the current
      // hardcoded SchemaToType with arktype only for validation.
    });
  });

  describe('Key findings summary', () => {
    it('documents how arktype should be integrated into Stringent', () => {
      /**
       * SUMMARY OF FINDINGS FOR TASK 1:
       *
       * 1. How does arktype's generic validation work?
       *    - type('number') creates a Type object that validates at runtime
       *    - type.validate<def> is a type utility that validates type strings at compile time
       *    - Invalid type strings like 'garbage' cause compile-time errors
       *
       * 2. How can we validate that a string is a valid arktype type at compile time?
       *    - Use type.validate<T> in function parameters
       *    - Example: function fn<const T>(schema: type.validate<T>) { ... }
       *    - This will cause compile errors for invalid type strings
       *
       * 3. How does type.infer work?
       *    - After creating a Type: const t = type('number')
       *    - Extract the TS type: type T = typeof t.infer // number
       *    - Works with all valid arktype definitions
       *
       * 4. What arktype types should Stringent support initially?
       *    - All primitives: 'number', 'string', 'boolean', 'null', 'undefined'
       *    - Unions: 'string | number' (for ternary result types)
       *    - Subtypes: 'string.email', 'number.integer' (validated at runtime)
       *    - Constraints: 'number >= 0' (validated at runtime)
       *
       * INTEGRATION APPROACH:
       *
       * For lhs(), rhs(), expr() constraint validation:
       *   export const lhs = <const T extends string>(constraint?: type.validate<T>) => ...
       *
       * For parser.parse() schema validation:
       *   parse<TSchema extends Record<string, string>>(
       *     input: string,
       *     schema: { [K in keyof TSchema]: type.validate<TSchema[K]> }
       *   ) => ...
       *
       * For SchemaToType replacement:
       *   - Use arktype's type.infer mechanism
       *   - The exact approach needs investigation since type.infer requires a Type instance
       *   - May need to use type('...').infer at the type level
       */
      expect(true).toBe(true);
    });
  });
});
