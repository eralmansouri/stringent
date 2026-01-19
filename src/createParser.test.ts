/**
 * Tests for createParser API
 *
 * Verifies that:
 * 1. Type-level parsing produces correct types (compile-time tests)
 * 2. Runtime parsing produces correct values (runtime tests)
 * 3. Bound evaluator API works correctly (Task 12)
 */

import { describe, it, expect } from 'vitest';
import { defineNode, lhs, rhs, constVal, createParser } from './index.js';
import type { Parse, ComputeGrammar, Context } from './index.js';
import type { NumberNode } from './primitive/index.js';
import { typeCheck, type AssertEqual } from './test-helpers.js';

// AST node type with named bindings
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
// Grammar Definition
// =============================================================================
// Only operators are defined - atoms (number, string, identifier, parentheses)
// are built-in and automatically included in the grammar.

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

// Only operators - atoms are built-in
const operators = [add, mul] as const;

// =============================================================================
// Create Parser
// =============================================================================

const parser = createParser(operators);

// =============================================================================
// Type-Level Tests (compile-time)
// =============================================================================

type Grammar = ComputeGrammar<typeof operators>;
type Ctx = Context<{}>;

describe('createParser type-level tests', () => {
  it('should parse simple number (compile-time)', () => {
    type R1 = Parse<Grammar, '42', Ctx>;
    type T1 = AssertEqual<R1, [NumberNode<'42'>, '']>;
    typeCheck<T1>(true);
  });

  it('should parse simple addition (compile-time)', () => {
    type R2 = Parse<Grammar, '1+2', Ctx>;
    type T2 = AssertEqual<R2, [AddNode<NumberNode<'1'>, NumberNode<'2'>>, '']>;
    typeCheck<T2>(true);
  });

  it('should parse with precedence - mul binds tighter (compile-time)', () => {
    type R3 = Parse<Grammar, '1+2*3', Ctx>;
    type ExpectedR3 = [AddNode<NumberNode<'1'>, MulNode<NumberNode<'2'>, NumberNode<'3'>>>, ''];
    type T3 = AssertEqual<R3, ExpectedR3>;
    typeCheck<T3>(true);
  });

  it('should return empty tuple for no match (compile-time)', () => {
    type R4 = Parse<Grammar, '@invalid', Ctx>;
    type T4 = AssertEqual<R4, []>;
    typeCheck<T4>(true);
  });
});

// =============================================================================
// Runtime Tests (using new bound evaluator API)
// =============================================================================

describe('createParser runtime tests', () => {
  it('should parse simple number', () => {
    const [evaluator, err] = parser.parse('42', {});
    expect(err).toBeNull();
    expect(evaluator).not.toBeNull();
    expect(evaluator!.ast.node).toBe('literal');
    expect((evaluator!.ast as unknown as { raw: string }).raw).toBe('42');
  });

  it('should parse simple addition', () => {
    const [evaluator, err] = parser.parse('1+2', {});
    expect(err).toBeNull();
    expect(evaluator).not.toBeNull();
    expect(evaluator!.ast.node).toBe('add');
  });

  it('should parse with precedence', () => {
    const [evaluator, err] = parser.parse('1+2*x', { x: 'number' });
    expect(err).toBeNull();
    expect(evaluator).not.toBeNull();
    const node = evaluator!.ast as unknown as {
      node: string;
      left: unknown;
      right: unknown;
    };
    expect(node.node).toBe('add');
    // Right should be mul(2, x)
    const right = node.right as { node: string };
    expect(right.node).toBe('mul');
  });

  it('should return error for partial parsing', () => {
    // @ts-expect-error - ValidatedInput requires full parsing, but we intentionally test partial parsing here
    const [evaluator, err] = parser.parse('42 rest', {});
    // With new API, this returns an error
    expect(err).not.toBeNull();
    expect(evaluator).toBeNull();
  });

  it('should return error for no match', () => {
    // @ts-expect-error - testing that invalid input causes type error
    const [evaluator, err] = parser.parse('@invalid', {});
    expect(err).not.toBeNull();
    expect(evaluator).toBeNull();
  });

  it('should handle chained addition (right-associative)', () => {
    const [evaluator, err] = parser.parse('1+2+x', { x: 'number' });
    expect(err).toBeNull();
    expect(evaluator).not.toBeNull();
    const node = evaluator!.ast as unknown as {
      node: string;
      left: unknown;
      right: unknown;
    };
    expect(node.node).toBe('add');
    // Right should be add(2, x) due to right-recursion
    const right = node.right as { node: string };
    expect(right.node).toBe('add');
  });

  it('should handle precedence with mul on right (2+1*3 → add(2, mul(1,3)))', () => {
    const [evaluator, err] = parser.parse('2+1*3', {});
    expect(err).toBeNull();
    expect(evaluator).not.toBeNull();
    const node = evaluator!.ast as unknown as {
      node: string;
      left: unknown;
      right: unknown;
    };
    expect(node.node).toBe('add');
    // Left should be 2
    const left = node.left as { node: string; raw: string };
    expect(left.node).toBe('literal');
    expect(left.raw).toBe('2');
    // Right should be mul(1, 3)
    const right = node.right as { node: string };
    expect(right.node).toBe('mul');
  });

  it('should handle parentheses (expr() resets to full grammar)', () => {
    const [evaluator, err] = parser.parse('(1+2)*3', {});
    expect(err).toBeNull();
    expect(evaluator).not.toBeNull();
    const node = evaluator!.ast as unknown as {
      node: string;
      left: unknown;
      right: unknown;
    };
    expect(node.node).toBe('mul');
    // Left should be the built-in parentheses node containing add(1, 2)
    const left = node.left as { node: string; inner: unknown };
    expect(left.node).toBe('parentheses');
  });

  it('should handle nested parentheses', () => {
    const [evaluator, err] = parser.parse('((1+2))', {});
    expect(err).toBeNull();
    expect(evaluator).not.toBeNull();
    const node = evaluator!.ast as unknown as { node: string };
    expect(node.node).toBe('parentheses');
  });
});
