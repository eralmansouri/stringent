/**
 * Constraint Validation Tests - Task 3
 *
 * Tests that lhs(), rhs(), and expr() validate constraint strings at compile time
 * using arktype. Invalid type strings like 'garbage' should cause type errors.
 */

import { describe, it, expect, expectTypeOf } from 'vitest';
import { lhs, rhs, expr, defineNode, constVal, ExprSchema } from './index.js';

describe('Constraint Validation - Task 3', () => {
  describe('lhs() - constraint validation', () => {
    it('accepts valid primitive constraints', () => {
      const numberLhs = lhs('number');
      const stringLhs = lhs('string');
      const booleanLhs = lhs('boolean');
      const nullLhs = lhs('null');
      const undefinedLhs = lhs('undefined');

      // All should have correct schema structure
      expect(numberLhs.kind).toBe('expr');
      expect(numberLhs.role).toBe('lhs');
      expect(numberLhs.constraint).toBe('number');

      expect(stringLhs.constraint).toBe('string');
      expect(booleanLhs.constraint).toBe('boolean');
      expect(nullLhs.constraint).toBe('null');
      expect(undefinedLhs.constraint).toBe('undefined');
    });

    it('accepts valid arktype subtypes', () => {
      const emailLhs = lhs('string.email');
      const integerLhs = lhs('number.integer');
      const uuidLhs = lhs('string.uuid');

      expect(emailLhs.constraint).toBe('string.email');
      expect(integerLhs.constraint).toBe('number.integer');
      expect(uuidLhs.constraint).toBe('string.uuid');
    });

    it('accepts valid arktype constraints', () => {
      const nonNegLhs = lhs('number >= 0');
      const positiveLhs = lhs('number > 0');
      const rangeLhs = lhs('1 <= number <= 100');
      const minLengthLhs = lhs('string >= 8');

      expect(nonNegLhs.constraint).toBe('number >= 0');
      expect(positiveLhs.constraint).toBe('number > 0');
      expect(rangeLhs.constraint).toBe('1 <= number <= 100');
      expect(minLengthLhs.constraint).toBe('string >= 8');
    });

    it('accepts valid union types', () => {
      const unionLhs = lhs('string | number');
      const tripleUnionLhs = lhs('string | number | boolean');

      expect(unionLhs.constraint).toBe('string | number');
      expect(tripleUnionLhs.constraint).toBe('string | number | boolean');
    });

    it('accepts no constraint (unconstrained expression)', () => {
      const unconstrainedLhs = lhs();

      expect(unconstrainedLhs.kind).toBe('expr');
      expect(unconstrainedLhs.role).toBe('lhs');
      expect(unconstrainedLhs.constraint).toBeUndefined();
    });

    it('rejects invalid constraint strings (type error)', () => {
      // @ts-expect-error - 'garbage' is not a valid arktype
      const garbageLhs = lhs('garbage');

      // @ts-expect-error - 'asdfghjkl' is not a valid arktype
      const _randomLhs = lhs('asdfghjkl');

      // @ts-expect-error - 'notAType' is not a valid arktype
      const _notATypeLhs = lhs('notAType');

      // Runtime still creates the schema (validation is compile-time only)
      expect(garbageLhs.constraint).toBe('garbage');
    });

    it('preserves constraint type in schema', () => {
      const numberLhs = lhs('number');
      const emailLhs = lhs('string.email');

      // Type-level check: constraint should be the literal type
      expectTypeOf(numberLhs).toMatchTypeOf<ExprSchema<'number', 'lhs'>>();
      expectTypeOf(emailLhs).toMatchTypeOf<ExprSchema<'string.email', 'lhs'>>();
    });

    it('works with .as() for named bindings', () => {
      const namedLhs = lhs('number').as('left');

      expect(namedLhs.kind).toBe('expr');
      expect(namedLhs.role).toBe('lhs');
      expect(namedLhs.constraint).toBe('number');
      expect(namedLhs.__named).toBe(true);
      expect(namedLhs.name).toBe('left');
    });
  });

  describe('rhs() - constraint validation', () => {
    it('accepts valid primitive constraints', () => {
      const numberRhs = rhs('number');
      const stringRhs = rhs('string');
      const booleanRhs = rhs('boolean');

      expect(numberRhs.kind).toBe('expr');
      expect(numberRhs.role).toBe('rhs');
      expect(numberRhs.constraint).toBe('number');
      expect(stringRhs.constraint).toBe('string');
      expect(booleanRhs.constraint).toBe('boolean');
    });

    it('accepts valid arktype subtypes', () => {
      const emailRhs = rhs('string.email');
      const integerRhs = rhs('number.integer');

      expect(emailRhs.constraint).toBe('string.email');
      expect(integerRhs.constraint).toBe('number.integer');
    });

    it('accepts valid arktype constraints', () => {
      const nonNegRhs = rhs('number >= 0');
      const positiveRhs = rhs('number > 0');

      expect(nonNegRhs.constraint).toBe('number >= 0');
      expect(positiveRhs.constraint).toBe('number > 0');
    });

    it('accepts valid union types', () => {
      const unionRhs = rhs('string | number');

      expect(unionRhs.constraint).toBe('string | number');
    });

    it('accepts no constraint (unconstrained expression)', () => {
      const unconstrainedRhs = rhs();

      expect(unconstrainedRhs.kind).toBe('expr');
      expect(unconstrainedRhs.role).toBe('rhs');
      expect(unconstrainedRhs.constraint).toBeUndefined();
    });

    it('rejects invalid constraint strings (type error)', () => {
      // @ts-expect-error - 'garbage' is not a valid arktype
      const garbageRhs = rhs('garbage');

      // @ts-expect-error - 'invalid_type_123' is not a valid arktype
      const _invalidRhs = rhs('invalid_type_123');

      expect(garbageRhs.constraint).toBe('garbage');
    });

    it('preserves constraint type in schema', () => {
      const numberRhs = rhs('number');
      const constrainedRhs = rhs('number >= 0');

      expectTypeOf(numberRhs).toMatchTypeOf<ExprSchema<'number', 'rhs'>>();
      expectTypeOf(constrainedRhs).toMatchTypeOf<ExprSchema<'number >= 0', 'rhs'>>();
    });

    it('works with .as() for named bindings', () => {
      const namedRhs = rhs('number').as('right');

      expect(namedRhs.kind).toBe('expr');
      expect(namedRhs.role).toBe('rhs');
      expect(namedRhs.constraint).toBe('number');
      expect(namedRhs.__named).toBe(true);
      expect(namedRhs.name).toBe('right');
    });
  });

  describe('expr() - constraint validation', () => {
    it('accepts valid primitive constraints', () => {
      const numberExpr = expr('number');
      const stringExpr = expr('string');
      const booleanExpr = expr('boolean');

      expect(numberExpr.kind).toBe('expr');
      expect(numberExpr.role).toBe('expr');
      expect(numberExpr.constraint).toBe('number');
      expect(stringExpr.constraint).toBe('string');
      expect(booleanExpr.constraint).toBe('boolean');
    });

    it('accepts valid arktype subtypes', () => {
      const emailExpr = expr('string.email');
      const integerExpr = expr('number.integer');

      expect(emailExpr.constraint).toBe('string.email');
      expect(integerExpr.constraint).toBe('number.integer');
    });

    it('accepts valid arktype constraints', () => {
      const nonNegExpr = expr('number >= 0');
      const positiveExpr = expr('number > 0');

      expect(nonNegExpr.constraint).toBe('number >= 0');
      expect(positiveExpr.constraint).toBe('number > 0');
    });

    it('accepts valid union types', () => {
      const unionExpr = expr('string | number');

      expect(unionExpr.constraint).toBe('string | number');
    });

    it('accepts no constraint (unconstrained expression)', () => {
      const unconstrainedExpr = expr();

      expect(unconstrainedExpr.kind).toBe('expr');
      expect(unconstrainedExpr.role).toBe('expr');
      expect(unconstrainedExpr.constraint).toBeUndefined();
    });

    it('rejects invalid constraint strings (type error)', () => {
      // @ts-expect-error - 'garbage' is not a valid arktype
      const garbageExpr = expr('garbage');

      // @ts-expect-error - 'not_a_valid_type' is not a valid arktype
      const _invalidExpr = expr('not_a_valid_type');

      expect(garbageExpr.constraint).toBe('garbage');
    });

    it('preserves constraint type in schema', () => {
      const numberExpr = expr('number');
      const unionExpr = expr('string | number');

      expectTypeOf(numberExpr).toMatchTypeOf<ExprSchema<'number', 'expr'>>();
      expectTypeOf(unionExpr).toMatchTypeOf<ExprSchema<'string | number', 'expr'>>();
    });

    it('works with .as() for named bindings', () => {
      const namedExpr = expr('boolean').as('condition');

      expect(namedExpr.kind).toBe('expr');
      expect(namedExpr.role).toBe('expr');
      expect(namedExpr.constraint).toBe('boolean');
      expect(namedExpr.__named).toBe(true);
      expect(namedExpr.name).toBe('condition');
    });
  });

  describe('defineNode() - integration with validated constraints', () => {
    it('works with validated lhs/rhs constraints in patterns', () => {
      const add = defineNode({
        name: 'add',
        pattern: [lhs('number').as('left'), constVal('+'), rhs('number').as('right')],
        precedence: 1,
        resultType: 'number',
        eval: ({ left, right }) => left + right,
      });

      expect(add.name).toBe('add');
      expect(add.pattern[0].constraint).toBe('number');
      expect(add.pattern[2].constraint).toBe('number');
    });

    it('works with arktype subtypes in patterns', () => {
      const concat = defineNode({
        name: 'concat',
        pattern: [lhs('string').as('left'), constVal('++'), rhs('string.email').as('right')],
        precedence: 1,
        resultType: 'string',
        eval: ({ left, right }) => left + right,
      });

      expect(concat.pattern[0].constraint).toBe('string');
      expect(concat.pattern[2].constraint).toBe('string.email');
    });

    it('works with arktype constraints in patterns', () => {
      const safeDiv = defineNode({
        name: 'safeDiv',
        pattern: [lhs('number').as('left'), constVal('/'), rhs('number > 0').as('right')],
        precedence: 2,
        resultType: 'number',
        eval: ({ left, right }) => left / right,
      });

      expect(safeDiv.pattern[0].constraint).toBe('number');
      expect(safeDiv.pattern[2].constraint).toBe('number > 0');
    });

    it('works with union types in patterns', () => {
      const ternary = defineNode({
        name: 'ternary',
        pattern: [
          lhs('boolean').as('condition'),
          constVal('?'),
          expr('string | number').as('then'),
          constVal(':'),
          expr('string | number').as('else'),
        ],
        precedence: 0,
        resultType: 'string | number',
      });

      expect(ternary.pattern[0].constraint).toBe('boolean');
      expect(ternary.pattern[2].constraint).toBe('string | number');
      expect(ternary.pattern[4].constraint).toBe('string | number');
    });

    it('rejects invalid constraints in defineNode (type error)', () => {
      // The error is on lhs('garbage'), not defineNode
      const invalidNode = defineNode({
        name: 'invalid',
        // @ts-expect-error - 'garbage' is not a valid arktype constraint
        pattern: [lhs('garbage').as('bad')],
        precedence: 1,
        resultType: 'unknown',
      });

      expect(invalidNode.name).toBe('invalid');
    });
  });

  describe('edge cases', () => {
    it('handles array types', () => {
      const arrayLhs = lhs('string[]');
      const nestedArrayLhs = lhs('number[][]');

      expect(arrayLhs.constraint).toBe('string[]');
      expect(nestedArrayLhs.constraint).toBe('number[][]');
    });

    it('handles complex union types', () => {
      const complexUnion = expr('string | number | boolean | null');

      expect(complexUnion.constraint).toBe('string | number | boolean | null');
    });

    it('handles Date type', () => {
      const dateLhs = lhs('Date');

      expect(dateLhs.constraint).toBe('Date');
    });

    it('handles bigint type', () => {
      const bigintLhs = lhs('bigint');

      expect(bigintLhs.constraint).toBe('bigint');
    });

    it('handles symbol type', () => {
      const symbolLhs = lhs('symbol');

      expect(symbolLhs.constraint).toBe('symbol');
    });
  });

  describe('defineNode() resultType validation (Task 4)', () => {
    it('accepts valid primitive resultType', () => {
      const numberNode = defineNode({
        name: 'numberResult',
        pattern: [lhs('number').as('value')],
        precedence: 1,
        resultType: 'number',
      });

      expect(numberNode.resultType).toBe('number');

      const stringNode = defineNode({
        name: 'stringResult',
        pattern: [lhs('string').as('value')],
        precedence: 1,
        resultType: 'string',
      });

      expect(stringNode.resultType).toBe('string');

      const booleanNode = defineNode({
        name: 'booleanResult',
        pattern: [lhs('boolean').as('value')],
        precedence: 1,
        resultType: 'boolean',
      });

      expect(booleanNode.resultType).toBe('boolean');
    });

    it('accepts valid arktype subtype resultType', () => {
      const emailNode = defineNode({
        name: 'emailResult',
        pattern: [lhs('string').as('value')],
        precedence: 1,
        resultType: 'string.email',
      });

      expect(emailNode.resultType).toBe('string.email');

      const integerNode = defineNode({
        name: 'integerResult',
        pattern: [lhs('number').as('value')],
        precedence: 1,
        resultType: 'number.integer',
      });

      expect(integerNode.resultType).toBe('number.integer');
    });

    it('accepts valid arktype constraint resultType', () => {
      const positiveNode = defineNode({
        name: 'positiveResult',
        pattern: [lhs('number').as('value')],
        precedence: 1,
        resultType: 'number >= 0',
      });

      expect(positiveNode.resultType).toBe('number >= 0');

      const rangeNode = defineNode({
        name: 'rangeResult',
        pattern: [lhs('number').as('value')],
        precedence: 1,
        resultType: '1 <= number <= 100',
      });

      expect(rangeNode.resultType).toBe('1 <= number <= 100');
    });

    it('accepts valid union resultType', () => {
      const unionNode = defineNode({
        name: 'unionResult',
        pattern: [lhs('boolean').as('condition')],
        precedence: 1,
        resultType: 'string | number',
      });

      expect(unionNode.resultType).toBe('string | number');

      const multiUnionNode = defineNode({
        name: 'multiUnionResult',
        pattern: [lhs('boolean').as('condition')],
        precedence: 1,
        resultType: 'string | number | boolean',
      });

      expect(multiUnionNode.resultType).toBe('string | number | boolean');
    });

    it('accepts array resultType', () => {
      const arrayNode = defineNode({
        name: 'arrayResult',
        pattern: [lhs('string[]').as('value')],
        precedence: 1,
        resultType: 'string[]',
      });

      expect(arrayNode.resultType).toBe('string[]');
    });

    it('accepts unknown resultType for computed types', () => {
      // 'unknown' is a valid arktype that allows any type
      // Used for nodes like parentheses where type is propagated
      const unknownNode = defineNode({
        name: 'unknownResult',
        pattern: [lhs().as('inner')],
        precedence: 'atom',
        resultType: 'unknown',
      });

      expect(unknownNode.resultType).toBe('unknown');
    });

    it('rejects invalid resultType (type error)', () => {
      const garbageNode = defineNode({
        name: 'garbageResult',
        pattern: [lhs('number').as('value')],
        precedence: 1,
        // @ts-expect-error - 'garbage' is not a valid arktype
        resultType: 'garbage',
      });

      // Runtime still creates the node (validation is compile-time only)
      expect(garbageNode.resultType).toBe('garbage');
    });

    it('rejects another invalid resultType (type error)', () => {
      const invalidNode = defineNode({
        name: 'invalidResult',
        pattern: [lhs('string').as('value')],
        precedence: 1,
        // @ts-expect-error - 'asdfghjkl' is not a valid arktype
        resultType: 'asdfghjkl',
      });

      // Runtime still creates the node (validation is compile-time only)
      expect(invalidNode.resultType).toBe('asdfghjkl');
    });

    it('rejects invalid misspelled resultType (type error)', () => {
      const misspelledNode = defineNode({
        name: 'misspelledResult',
        pattern: [lhs('number').as('value')],
        precedence: 1,
        // @ts-expect-error - 'nubmer' is not a valid arktype (misspelled)
        resultType: 'nubmer',
      });

      // Runtime still creates the node (validation is compile-time only)
      expect(misspelledNode.resultType).toBe('nubmer');
    });

    it('preserves resultType type in NodeSchema', () => {
      const add = defineNode({
        name: 'add',
        pattern: [lhs('number').as('left'), constVal('+'), rhs('number').as('right')],
        precedence: 1,
        resultType: 'number',
        eval: ({ left, right }) => left + right,
      });

      // Type-level check: resultType should be the literal 'number', not string
      type ResultType = typeof add.resultType;
      const _check: ResultType = 'number';
      // @ts-expect-error - resultType is 'number', not 'string'
      const _badCheck: ResultType = 'string';

      expect(add.resultType).toBe('number');
    });
  });
});
