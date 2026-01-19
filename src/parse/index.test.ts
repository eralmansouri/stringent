/**
 * Tests for Parse<Grammar, Input, Context>
 *
 * Verifies that type-level parsing produces correct types.
 * These are compile-time tests - if this file compiles, the tests pass.
 */

import { describe, it } from 'vitest';
import type { Context } from '../context.js';
import type { ComputeGrammar } from '../grammar/index.js';
import type { Parse } from './index.js';
import type { NumberNode } from '../primitive/index.js';
import { defineNode, lhs, rhs, constVal } from '../schema/index.js';
import { typeCheck, type AssertEqual } from '../test-helpers.js';

// AST node types with named bindings
interface AddNode<TLeft, TRight> {
  readonly node: 'add';
  readonly outputSchema: 'number';
  readonly left: TLeft;
  readonly right: TRight;
}

interface MulNode<TLeft, TRight> {
  readonly node: 'mul';
  readonly outputSchema: 'number';
  readonly left: TLeft;
  readonly right: TRight;
}

// =============================================================================
// Test Grammar
// =============================================================================
// Only operators are defined - atoms are built-in

const _add = defineNode({
  name: 'add',
  pattern: [lhs('number').as('left'), constVal('+'), rhs('number').as('right')],
  precedence: 1,
  resultType: 'number',
});

const _mul = defineNode({
  name: 'mul',
  pattern: [lhs('number').as('left'), constVal('*'), rhs('number').as('right')],
  precedence: 2,
  resultType: 'number',
});

// Only operators - atoms are built-in and automatically appended
type Operators = readonly [typeof _add, typeof _mul];
type Grammar = ComputeGrammar<Operators>;
type Ctx = Context<{ x: 'number'; y: 'string' }>;

// =============================================================================
// Type-Level Tests
// =============================================================================

describe('Parse type-level tests', () => {
  it('should parse simple number', () => {
    type R1 = Parse<Grammar, '42', Ctx>;
    type T1 = AssertEqual<R1, [NumberNode<'42'>, '']>;
    typeCheck<T1>(true);
  });

  it('should parse simple addition', () => {
    type R2 = Parse<Grammar, '1+2', Ctx>;
    type T2 = AssertEqual<R2, [AddNode<NumberNode<'1'>, NumberNode<'2'>>, '']>;
    typeCheck<T2>(true);
  });

  it('should parse with precedence (mul binds tighter)', () => {
    // "1+2*3" should parse as: Add(1, Mul(2, 3))
    type R3 = Parse<Grammar, '1+2*3', Ctx>;
    type ExpectedR3 = [AddNode<NumberNode<'1'>, MulNode<NumberNode<'2'>, NumberNode<'3'>>>, ''];
    type T3 = AssertEqual<R3, ExpectedR3>;
    typeCheck<T3>(true);
  });

  it('should parse with remaining input', () => {
    type R4 = Parse<Grammar, '42 rest', Ctx>;
    type T4 = AssertEqual<R4, [NumberNode<'42'>, ' rest']>;
    typeCheck<T4>(true);
  });

  it('should return empty array for no match', () => {
    type R5 = Parse<Grammar, '@invalid', Ctx>;
    type T5 = AssertEqual<R5, []>;
    typeCheck<T5>(true);
  });

  it('should handle chained addition (right-associative)', () => {
    // Our current implementation is right-recursive: Add(1, Add(2, 3))
    type R6 = Parse<Grammar, '1+2+3', Ctx>;
    type ExpectedR6 = [AddNode<NumberNode<'1'>, AddNode<NumberNode<'2'>, NumberNode<'3'>>>, ''];
    type T6 = AssertEqual<R6, ExpectedR6>;
    typeCheck<T6>(true);
  });

  it('should handle precedence with mul first: 1*3+2 → Add(Mul(1,3), 2)', () => {
    // NOT Mul(1, Add(3,2)) - that would be wrong precedence
    type R7 = Parse<Grammar, '1*3+2', Ctx>;
    type ExpectedR7 = [AddNode<MulNode<NumberNode<'1'>, NumberNode<'3'>>, NumberNode<'2'>>, ''];
    type T7 = AssertEqual<R7, ExpectedR7>;
    typeCheck<T7>(true);
  });
});
