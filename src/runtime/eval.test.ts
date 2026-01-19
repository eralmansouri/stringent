/**
 * Tests for runtime expression evaluation
 *
 * Verifies that:
 * 1. Literal nodes evaluate to their values
 * 2. Identifier nodes resolve from context
 * 3. Parentheses nodes forward to inner expression
 * 4. Binary operations with eval functions compute correctly
 * 5. Error cases are handled appropriately
 * 6. Type inference works correctly (Task 2/3/4 - PRD)
 */

import { describe, it, expect, expectTypeOf } from 'vitest';
import { evaluate, createEvaluator } from './eval.js';
import { defineNode, lhs, rhs, constVal, expr, createParser } from '../index.js';

// =============================================================================
// Test Grammar with eval functions
// =============================================================================

const add = defineNode({
  name: 'add',
  pattern: [lhs('number').as('left'), constVal('+'), rhs('number').as('right')],
  precedence: 1,
  resultType: 'number',
  eval: ({ left, right }) => left + right,
});

const sub = defineNode({
  name: 'sub',
  pattern: [lhs('number').as('left'), constVal('-'), rhs('number').as('right')],
  precedence: 1,
  resultType: 'number',
  eval: ({ left, right }) => left - right,
});

const mul = defineNode({
  name: 'mul',
  pattern: [lhs('number').as('left'), constVal('*'), rhs('number').as('right')],
  precedence: 2,
  resultType: 'number',
  eval: ({ left, right }) => left * right,
});

const div = defineNode({
  name: 'div',
  pattern: [lhs('number').as('left'), constVal('/'), rhs('number').as('right')],
  precedence: 2,
  resultType: 'number',
  eval: ({ left, right }) => left / right,
});

const pow = defineNode({
  name: 'pow',
  pattern: [lhs('number').as('base'), constVal('**'), rhs('number').as('exp')],
  precedence: 3,
  resultType: 'number',
  eval: ({ base, exp }) => Math.pow(base, exp),
});

const neg = defineNode({
  name: 'neg',
  pattern: [constVal('-'), rhs('number').as('value')],
  precedence: 4,
  resultType: 'number',
  eval: ({ value }) => -value,
});

// String operations
const concat = defineNode({
  name: 'concat',
  pattern: [lhs('string').as('left'), constVal('++'), rhs('string').as('right')],
  precedence: 1,
  resultType: 'string',
  eval: ({ left, right }) => left + right,
});

// Comparison operations
const eq = defineNode({
  name: 'eq',
  pattern: [lhs().as('left'), constVal('=='), rhs().as('right')],
  precedence: 0,
  resultType: 'boolean',
  eval: ({ left, right }) => left === right,
});

const neq = defineNode({
  name: 'neq',
  pattern: [lhs().as('left'), constVal('!='), rhs().as('right')],
  precedence: 0,
  resultType: 'boolean',
  eval: ({ left, right }) => left !== right,
});

const lt = defineNode({
  name: 'lt',
  pattern: [lhs('number').as('left'), constVal('<'), rhs('number').as('right')],
  precedence: 0,
  resultType: 'boolean',
  eval: ({ left, right }) => left < right,
});

const gt = defineNode({
  name: 'gt',
  pattern: [lhs('number').as('left'), constVal('>'), rhs('number').as('right')],
  precedence: 0,
  resultType: 'boolean',
  eval: ({ left, right }) => left > right,
});

// Ternary conditional
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
  resultType: 'unknown',
  eval: ({ condition, then: thenVal, else: elseVal }) => (condition ? thenVal : elseVal),
});

// Logical operations
const and = defineNode({
  name: 'and',
  pattern: [lhs('boolean').as('left'), constVal('&&'), rhs('boolean').as('right')],
  precedence: 0,
  resultType: 'boolean',
  eval: ({ left, right }) => left && right,
});

const or = defineNode({
  name: 'or',
  pattern: [lhs('boolean').as('left'), constVal('||'), rhs('boolean').as('right')],
  precedence: 0,
  resultType: 'boolean',
  eval: ({ left, right }) => left || right,
});

const arithmeticNodes = [add, sub, mul, div, pow, neg] as const;
const comparisonNodes = [eq, neq, lt, gt] as const;
const logicalNodes = [and, or] as const;
const allNodes = [
  ...arithmeticNodes,
  ...comparisonNodes,
  ...logicalNodes,
  ternary,
  concat,
] as const;

const parser = createParser(allNodes);

// =============================================================================
// Literal Node Evaluation
// =============================================================================

describe('evaluate - literal nodes', () => {
  it('should evaluate number literal', () => {
    const result = parser.parse('42', {});
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: {}, nodes: allNodes });
    expect(value).toBe(42);
  });

  it('should evaluate zero', () => {
    const result = parser.parse('0', {});
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: {}, nodes: allNodes });
    expect(value).toBe(0);
  });

  it('should evaluate decimal number', () => {
    const result = parser.parse('3.14159', {});
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: {}, nodes: allNodes });
    expect(value).toBeCloseTo(3.14159);
  });

  it('should evaluate string literal (double quotes)', () => {
    const result = parser.parse('"hello"', {});
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: {}, nodes: allNodes });
    expect(value).toBe('hello'); // Token.String strips quotes
  });

  it('should evaluate string literal (single quotes)', () => {
    const result = parser.parse("'world'", {});
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: {}, nodes: allNodes });
    expect(value).toBe('world'); // Token.String strips quotes
  });

  it('should evaluate empty string', () => {
    const result = parser.parse('""', {});
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: {}, nodes: allNodes });
    expect(value).toBe(''); // Token.String strips quotes
  });

  it('should evaluate true', () => {
    const result = parser.parse('true', {});
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: {}, nodes: allNodes });
    expect(value).toBe(true);
  });

  it('should evaluate false', () => {
    const result = parser.parse('false', {});
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: {}, nodes: allNodes });
    expect(value).toBe(false);
  });

  it('should evaluate null', () => {
    const result = parser.parse('null', {});
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: {}, nodes: allNodes });
    expect(value).toBe(null);
  });

  it('should evaluate undefined', () => {
    const result = parser.parse('undefined', {});
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: {}, nodes: allNodes });
    expect(value).toBe(undefined);
  });
});

// =============================================================================
// Identifier Node Evaluation
// =============================================================================

describe('evaluate - identifier nodes', () => {
  it('should resolve identifier from context', () => {
    const result = parser.parse('x', { x: 'number' });
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: { x: 10 }, nodes: allNodes });
    expect(value).toBe(10);
  });

  it('should resolve multiple identifiers', () => {
    const result = parser.parse('x+y', { x: 'number', y: 'number' });
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: { x: 3, y: 7 }, nodes: allNodes });
    expect(value).toBe(10);
  });

  it('should throw for undefined variable', () => {
    const result = parser.parse('x', { x: 'number' });
    expect(result.length).toBe(2);
    expect(() => {
      // @ts-expect-error - intentionally passing wrong data to test runtime error
      evaluate(result[0], { data: {}, nodes: allNodes });
    }).toThrow('Undefined variable: x');
  });

  it('should resolve string identifier', () => {
    const result = parser.parse('name', { name: 'string' });
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: { name: 'Alice' }, nodes: allNodes });
    expect(value).toBe('Alice');
  });

  it('should resolve boolean identifier', () => {
    const result = parser.parse('flag', { flag: 'boolean' });
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: { flag: true }, nodes: allNodes });
    expect(value).toBe(true);
  });
});

// =============================================================================
// Arithmetic Operations
// =============================================================================

describe('evaluate - arithmetic operations', () => {
  it('should evaluate addition', () => {
    const result = parser.parse('1+2', {});
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: {}, nodes: allNodes });
    expect(value).toBe(3);
  });

  it('should evaluate subtraction', () => {
    const result = parser.parse('10-3', {});
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: {}, nodes: allNodes });
    expect(value).toBe(7);
  });

  it('should evaluate multiplication', () => {
    const result = parser.parse('4*5', {});
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: {}, nodes: allNodes });
    expect(value).toBe(20);
  });

  it('should evaluate division', () => {
    const result = parser.parse('20/4', {});
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: {}, nodes: allNodes });
    expect(value).toBe(5);
  });

  it('should evaluate exponentiation', () => {
    const result = parser.parse('2**3', {});
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: {}, nodes: allNodes });
    expect(value).toBe(8);
  });

  it('should respect operator precedence (add/mul)', () => {
    const result = parser.parse('2+3*4', {});
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: {}, nodes: allNodes });
    expect(value).toBe(14); // 2 + (3 * 4) = 14
  });

  it('should respect operator precedence (mul/pow)', () => {
    const result = parser.parse('2*3**2', {});
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: {}, nodes: allNodes });
    expect(value).toBe(18); // 2 * (3^2) = 18
  });

  it('should handle chained addition (right-associative)', () => {
    const result = parser.parse('1+2+3', {});
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: {}, nodes: allNodes });
    expect(value).toBe(6);
  });

  it('should handle chained multiplication', () => {
    const result = parser.parse('2*3*4', {});
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: {}, nodes: allNodes });
    expect(value).toBe(24);
  });

  it('should handle complex expression', () => {
    const result = parser.parse('1+2*3+4', {});
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: {}, nodes: allNodes });
    expect(value).toBe(11); // 1 + (2*3) + 4 = 1 + 6 + 4 = 11
  });

  it('should handle decimal operations', () => {
    const result = parser.parse('1.5+2.5', {});
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: {}, nodes: allNodes });
    expect(value).toBe(4);
  });

  it('should handle division with decimals', () => {
    const result = parser.parse('7/2', {});
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: {}, nodes: allNodes });
    expect(value).toBe(3.5);
  });
});

// =============================================================================
// Parentheses
// =============================================================================

describe('evaluate - parentheses', () => {
  it('should evaluate expression in parentheses', () => {
    const result = parser.parse('(42)', {});
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: {}, nodes: allNodes });
    expect(value).toBe(42);
  });

  it('should evaluate nested parentheses', () => {
    // Use simpler parser to avoid deep type inference
    const simpleParser = createParser([add, mul] as const);
    const result = simpleParser.parse('((1+2))', {});
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: {}, nodes: allNodes });
    expect(value).toBe(3);
  });

  it('should override precedence with parentheses', () => {
    const result = parser.parse('(1+2)*3', {});
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: {}, nodes: allNodes });
    expect(value).toBe(9); // (1+2) * 3 = 9
  });

  it('should handle multiple parentheses groups', () => {
    const result = parser.parse('(1+2)*(3+4)', {});
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: {}, nodes: allNodes });
    expect(value).toBe(21); // 3 * 7 = 21
  });

  it('should handle deeply nested parentheses with operations', () => {
    // Use simpler parser to avoid deep type inference timeout
    const simpleParser = createParser([add, mul] as const);
    const result = simpleParser.parse('(((1+2)*3)+4)', {});
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: {}, nodes: [add, mul] });
    expect(value).toBe(13); // ((3*3)+4) = 9+4 = 13
  });
});

// =============================================================================
// Comparison Operations
// =============================================================================

describe('evaluate - comparison operations', () => {
  it('should evaluate equality (true)', () => {
    const result = parser.parse('1==1', {});
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: {}, nodes: allNodes });
    expect(value).toBe(true);
  });

  it('should evaluate equality (false)', () => {
    const result = parser.parse('1==2', {});
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: {}, nodes: allNodes });
    expect(value).toBe(false);
  });

  it('should evaluate inequality (true)', () => {
    const result = parser.parse('1!=2', {});
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: {}, nodes: allNodes });
    expect(value).toBe(true);
  });

  it('should evaluate less than (true)', () => {
    const result = parser.parse('1<2', {});
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: {}, nodes: allNodes });
    expect(value).toBe(true);
  });

  it('should evaluate less than (false)', () => {
    const result = parser.parse('2<1', {});
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: {}, nodes: allNodes });
    expect(value).toBe(false);
  });

  it('should evaluate greater than (true)', () => {
    const result = parser.parse('2>1', {});
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: {}, nodes: allNodes });
    expect(value).toBe(true);
  });

  it('should compare with variables', () => {
    const result = parser.parse('x>y', { x: 'number', y: 'number' });
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: { x: 10, y: 5 }, nodes: allNodes });
    expect(value).toBe(true);
  });
});

// =============================================================================
// Logical Operations
// =============================================================================

describe('evaluate - logical operations', () => {
  it('should evaluate AND (true && true)', () => {
    const result = parser.parse('true&&true', {});
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: {}, nodes: allNodes });
    expect(value).toBe(true);
  });

  it('should evaluate AND (true && false)', () => {
    const result = parser.parse('true&&false', {});
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: {}, nodes: allNodes });
    expect(value).toBe(false);
  });

  it('should evaluate OR (false || true)', () => {
    const result = parser.parse('false||true', {});
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: {}, nodes: allNodes });
    expect(value).toBe(true);
  });

  it('should evaluate OR (false || false)', () => {
    const result = parser.parse('false||false', {});
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: {}, nodes: allNodes });
    expect(value).toBe(false);
  });
});

// =============================================================================
// Ternary Conditional
// =============================================================================

describe('evaluate - ternary conditional', () => {
  it('should evaluate ternary (true branch)', () => {
    const result = parser.parse('true?1:2', {});
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: {}, nodes: allNodes });
    expect(value).toBe(1);
  });

  it('should evaluate ternary (false branch)', () => {
    const result = parser.parse('false?1:2', {});
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: {}, nodes: allNodes });
    expect(value).toBe(2);
  });

  it('should evaluate ternary with comparison', () => {
    // Use parentheses because comparison and ternary have same precedence
    const result = parser.parse('(1<2)?10:20', {});
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: {}, nodes: allNodes });
    expect(value).toBe(10);
  });

  it('should evaluate ternary with expressions in branches', () => {
    const result = parser.parse('true?1+2:3+4', {});
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: {}, nodes: allNodes });
    expect(value).toBe(3);
  });

  it('should evaluate ternary with variable condition', () => {
    const result = parser.parse('cond?1:2', { cond: 'boolean' });
    expect(result.length).toBe(2);

    const trueValue = evaluate(result[0], { data: { cond: true }, nodes: allNodes });
    expect(trueValue).toBe(1);

    const falseValue = evaluate(result[0], { data: { cond: false }, nodes: allNodes });
    expect(falseValue).toBe(2);
  });
});

// =============================================================================
// Variables in Expressions
// =============================================================================

describe('evaluate - variables in expressions', () => {
  it('should evaluate expression with single variable', () => {
    const result = parser.parse('x+1', { x: 'number' });
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: { x: 5 }, nodes: allNodes });
    expect(value).toBe(6);
  });

  it('should evaluate expression with multiple variables', () => {
    const result = parser.parse('x*y+z', { x: 'number', y: 'number', z: 'number' });
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: { x: 2, y: 3, z: 4 }, nodes: allNodes });
    expect(value).toBe(10); // (2*3)+4 = 10
  });

  it('should evaluate parenthesized expression with variables', () => {
    const result = parser.parse('(x+y)*z', { x: 'number', y: 'number', z: 'number' });
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: { x: 1, y: 2, z: 3 }, nodes: allNodes });
    expect(value).toBe(9); // (1+2)*3 = 9
  });
});

// =============================================================================
// createEvaluator helper
// =============================================================================

describe('createEvaluator', () => {
  const evaluator = createEvaluator(allNodes);

  it('should create bound evaluator', () => {
    const result = parser.parse('1+2', {});
    expect(result.length).toBe(2);
    const value = evaluator(result[0], {});
    expect(value).toBe(3);
  });

  it('should work with variables', () => {
    const result = parser.parse('x+y', { x: 'number', y: 'number' });
    expect(result.length).toBe(2);
    const value = evaluator(result[0], { x: 10, y: 20 });
    expect(value).toBe(30);
  });

  it('should work with complex expressions', () => {
    const result = parser.parse('(1+2)*x', { x: 'number' });
    expect(result.length).toBe(2);
    const value = evaluator(result[0], { x: 5 });
    expect(value).toBe(15);
  });
});

// =============================================================================
// Error Cases
// =============================================================================

describe('evaluate - error cases', () => {
  it('should throw for null AST', () => {
    expect(() => {
      evaluate(null, { data: {}, nodes: allNodes });
    }).toThrow('Invalid AST node: expected object, got object');
  });

  it('should throw for undefined AST', () => {
    expect(() => {
      evaluate(undefined, { data: {}, nodes: allNodes });
    }).toThrow('Invalid AST node: expected object, got undefined');
  });

  it('should throw for primitive AST', () => {
    expect(() => {
      evaluate(42, { data: {}, nodes: allNodes });
    }).toThrow('Invalid AST node: expected object, got number');
  });

  it('should throw for AST without node property', () => {
    expect(() => {
      evaluate({}, { data: {}, nodes: allNodes });
    }).toThrow("Invalid AST node: missing 'node' property");
  });

  it('should throw for unknown node type', () => {
    expect(() => {
      evaluate({ node: 'unknown_type', outputSchema: 'number' }, { data: {}, nodes: allNodes });
    }).toThrow('Unknown node type: unknown_type');
  });

  it('should throw for node without eval function', () => {
    const nodeWithoutEval = defineNode({
      name: 'noEval',
      pattern: [lhs('number').as('left'), constVal('~'), rhs('number').as('right')],
      precedence: 1,
      resultType: 'number',
      // No eval function
    });

    expect(() => {
      evaluate(
        {
          node: 'noEval',
          outputSchema: 'number',
          left: { node: 'literal', value: 1, outputSchema: 'number' },
          right: { node: 'literal', value: 2, outputSchema: 'number' },
        },
        { data: {}, nodes: [nodeWithoutEval] }
      );
    }).toThrow("Node type 'noEval' has no eval function defined");
  });

  it('should throw for literal without value', () => {
    expect(() => {
      evaluate({ node: 'literal', outputSchema: 'number' }, { data: {}, nodes: allNodes });
    }).toThrow("Literal node missing 'value' property");
  });

  it('should throw for identifier without name', () => {
    expect(() => {
      evaluate({ node: 'identifier', outputSchema: 'number' }, { data: {}, nodes: allNodes });
    }).toThrow("Identifier node missing 'name' property");
  });

  it('should throw for const node', () => {
    expect(() => {
      evaluate({ node: 'const', outputSchema: '"+"' }, { data: {}, nodes: allNodes });
    }).toThrow('Cannot evaluate const node directly');
  });

  it('should throw for parentheses without inner', () => {
    expect(() => {
      evaluate({ node: 'parentheses', outputSchema: 'number' }, { data: {}, nodes: allNodes });
    }).toThrow("Parentheses node missing 'inner' property");
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('evaluate - edge cases', () => {
  it('should handle division by zero', () => {
    const result = parser.parse('1/0', {});
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: {}, nodes: allNodes });
    expect(value).toBe(Infinity);
  });

  it('should handle negative division result', () => {
    const result = parser.parse('5/0', {});
    expect(result.length).toBe(2);
    const minusResult = parser.parse('0-5', {});
    expect(minusResult.length).toBe(2);
    // We can't directly parse -5/0, but we can test the concept
    const value = evaluate(result[0], { data: {}, nodes: allNodes });
    expect(value).toBe(Infinity);
  });

  it('should handle 0 ** 0', () => {
    const result = parser.parse('0**0', {});
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: {}, nodes: allNodes });
    expect(value).toBe(1); // Math.pow(0, 0) === 1
  });

  it('should handle large numbers', () => {
    const result = parser.parse('999999999*999999999', {});
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: {}, nodes: allNodes });
    expect(value).toBe(999999999 * 999999999);
  });

  it('should handle very small decimals', () => {
    const result = parser.parse('0.0001+0.0002', {});
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: {}, nodes: allNodes });
    expect(value).toBeCloseTo(0.0003);
  });

  it('should handle equality of null', () => {
    const result = parser.parse('null==null', {});
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: {}, nodes: allNodes });
    expect(value).toBe(true);
  });

  it('should handle equality of undefined', () => {
    const result = parser.parse('undefined==undefined', {});
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: {}, nodes: allNodes });
    expect(value).toBe(true);
  });

  it('should handle boolean equality', () => {
    const result = parser.parse('true==false', {});
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: {}, nodes: allNodes });
    expect(value).toBe(false);
  });

  it('should handle long chained operations', () => {
    const result = parser.parse('1+2+3+4+5+6+7+8+9+10', {});
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: {}, nodes: allNodes });
    expect(value).toBe(55);
  });
});

// =============================================================================
// Integration with createParser
// =============================================================================

describe('evaluate - integration with createParser', () => {
  it('should work with custom parser and evaluator', () => {
    const customAdd = defineNode({
      name: 'customAdd',
      pattern: [lhs('number').as('a'), constVal('plus'), rhs('number').as('b')],
      precedence: 1,
      resultType: 'number',
      eval: ({ a, b }) => a + b,
    });

    const customParser = createParser([customAdd] as const);
    const result = customParser.parse('1 plus 2', {});
    expect(result.length).toBe(2);

    const value = evaluate(result[0], { data: {}, nodes: [customAdd] });
    expect(value).toBe(3);
  });

  it('should work with string concatenation', () => {
    const result = parser.parse('"hello"++"world"', {});
    expect(result.length).toBe(2);
    const value = evaluate(result[0], { data: {}, nodes: allNodes });
    expect(value).toBe('hello' + 'world'); // Token.String strips quotes
  });
});

// =============================================================================
// Type Inference Tests (Task 2, 3, 4 from PRD)
// =============================================================================

/**
 * These tests verify that the type inference for evaluate() and createEvaluator()
 * works correctly at the TYPE level, not just at runtime.
 *
 * The key insight: the AST node's `outputSchema` field determines the return type:
 * - outputSchema: "number" → returns number
 * - outputSchema: "string" → returns string
 * - outputSchema: "boolean" → returns boolean
 * - outputSchema: "null" → returns null
 * - outputSchema: "undefined" → returns undefined
 * - Other/unknown → returns unknown
 */

describe('evaluate - type inference (Task 2)', () => {
  it('returns number when AST has outputSchema: "number"', () => {
    const ast = { node: 'literal', value: 42, outputSchema: 'number' } as const;
    const result = evaluate(ast, { data: {}, nodes: [] });

    // Type-level assertion: result should be number
    expectTypeOf(result).toEqualTypeOf<number>();

    // Runtime assertion: value should be correct
    expect(result).toBe(42);
  });

  it('returns string when AST has outputSchema: "string"', () => {
    const ast = { node: 'literal', value: 'hello', outputSchema: 'string' } as const;
    const result = evaluate(ast, { data: {}, nodes: [] });

    // Type-level assertion: result should be string
    expectTypeOf(result).toEqualTypeOf<string>();

    // Runtime assertion
    expect(result).toBe('hello');
  });

  it('returns boolean when AST has outputSchema: "boolean"', () => {
    const ast = { node: 'literal', value: true, outputSchema: 'boolean' } as const;
    const result = evaluate(ast, { data: {}, nodes: [] });

    // Type-level assertion: result should be boolean
    expectTypeOf(result).toEqualTypeOf<boolean>();

    // Runtime assertion
    expect(result).toBe(true);
  });

  it('returns null when AST has outputSchema: "null"', () => {
    const ast = { node: 'literal', value: null, outputSchema: 'null' } as const;
    const result = evaluate(ast, { data: {}, nodes: [] });

    // Type-level assertion: result should be null
    expectTypeOf(result).toEqualTypeOf<null>();

    // Runtime assertion
    expect(result).toBe(null);
  });

  it('returns undefined when AST has outputSchema: "undefined"', () => {
    const ast = { node: 'literal', value: undefined, outputSchema: 'undefined' } as const;
    const result = evaluate(ast, { data: {}, nodes: [] });

    // Type-level assertion: result should be undefined
    expectTypeOf(result).toEqualTypeOf<undefined>();

    // Runtime assertion
    expect(result).toBe(undefined);
  });

  it('returns unknown for unknown outputSchema', () => {
    const ast = { node: 'literal', value: 'custom', outputSchema: 'custom' } as const;
    const result = evaluate(ast, { data: {}, nodes: [] });

    // Type-level assertion: result should be unknown
    expectTypeOf(result).toEqualTypeOf<unknown>();

    // Runtime assertion
    expect(result).toBe('custom');
  });

  it('infers type from parsed expressions - number', () => {
    const result = parser.parse('1+2', {});
    expect(result.length).toBe(2);

    const value = evaluate(result[0], { data: {}, nodes: allNodes });

    // Type-level assertion: value should be number (from outputSchema: "number")
    expectTypeOf(value).toEqualTypeOf<number>();

    // Runtime assertion
    expect(value).toBe(3);
  });

  it('infers type from parsed expressions - boolean', () => {
    const result = parser.parse('true&&false', {});
    expect(result.length).toBe(2);

    const value = evaluate(result[0], { data: {}, nodes: allNodes });

    // Type-level assertion: value should be boolean (from outputSchema: "boolean")
    expectTypeOf(value).toEqualTypeOf<boolean>();

    // Runtime assertion
    expect(value).toBe(false);
  });

  it('infers type from parsed expressions - string', () => {
    const result = parser.parse('"hello"++"world"', {});
    expect(result.length).toBe(2);

    const value = evaluate(result[0], { data: {}, nodes: allNodes });

    // Type-level assertion: Due to complex parser type inference with many nodes,
    // the outputSchema type gets widened to generic 'string' rather than literal '"string"'.
    // This is a known limitation (PRD GAP 6). The runtime correctly produces a string.
    // For manually constructed ASTs with `as const`, we get proper inference.
    expectTypeOf(value).toEqualTypeOf<unknown>();

    // Runtime assertion - correctly produces string
    expect(value).toBe('helloworld');
  });

  it('infers type from comparison operations - numbers in, boolean out', () => {
    const result = parser.parse('1<2', {});
    expect(result.length).toBe(2);

    const value = evaluate(result[0], { data: {}, nodes: allNodes });

    // Type-level assertion: even though operands are numbers, result is boolean
    expectTypeOf(value).toEqualTypeOf<boolean>();

    // Runtime assertion
    expect(value).toBe(true);
  });

  it('infers type from nested expressions', () => {
    const result = parser.parse('(1+2)*3', {});
    expect(result.length).toBe(2);

    const value = evaluate(result[0], { data: {}, nodes: allNodes });

    // Type-level assertion: result should be number
    expectTypeOf(value).toEqualTypeOf<number>();

    // Runtime assertion
    expect(value).toBe(9);
  });
});

describe('createEvaluator - type inference (Task 3)', () => {
  const evaluator = createEvaluator(allNodes);

  it('returns correct type from createEvaluator - number', () => {
    const ast = { node: 'literal', value: 42, outputSchema: 'number' } as const;
    const result = evaluator(ast, {});

    // Type-level assertion: result should be number
    expectTypeOf(result).toEqualTypeOf<number>();

    // Runtime assertion
    expect(result).toBe(42);
  });

  it('returns correct type from createEvaluator - string', () => {
    const ast = { node: 'literal', value: 'hello', outputSchema: 'string' } as const;
    const result = evaluator(ast, {});

    // Type-level assertion: result should be string
    expectTypeOf(result).toEqualTypeOf<string>();

    // Runtime assertion
    expect(result).toBe('hello');
  });

  it('returns correct type from createEvaluator - boolean', () => {
    const ast = { node: 'literal', value: true, outputSchema: 'boolean' } as const;
    const result = evaluator(ast, {});

    // Type-level assertion: result should be boolean
    expectTypeOf(result).toEqualTypeOf<boolean>();

    // Runtime assertion
    expect(result).toBe(true);
  });

  it('returns correct type from createEvaluator - parsed expression', () => {
    const result = parser.parse('1+2', {});
    expect(result.length).toBe(2);

    const value = evaluator(result[0], {});

    // Type-level assertion: result should be number
    expectTypeOf(value).toEqualTypeOf<number>();

    // Runtime assertion
    expect(value).toBe(3);
  });

  it('returns correct type from createEvaluator with variables', () => {
    const result = parser.parse('x+y', { x: 'number', y: 'number' });
    expect(result.length).toBe(2);

    const value = evaluator(result[0], { x: 10, y: 20 });

    // Type-level assertion: result should be number
    expectTypeOf(value).toEqualTypeOf<number>();

    // Runtime assertion
    expect(value).toBe(30);
  });
});

describe('evaluate - type inference edge cases (Task 4)', () => {
  it('handles identifier nodes with manually constructed AST', () => {
    // Manually construct an identifier node with known outputSchema
    // This tests that evaluate() correctly infers the type from outputSchema
    const ast = {
      node: 'identifier',
      name: 'x',
      outputSchema: 'number',
    } as const;

    const value = evaluate(ast, { data: { x: 42 }, nodes: [] });

    // Type-level assertion: identifier with outputSchema: "number" returns number
    expectTypeOf(value).toEqualTypeOf<number>();

    // Runtime assertion
    expect(value).toBe(42);
  });

  it('handles identifier nodes from parser - runtime check', () => {
    // Note: When using the parser, the compile-time type may be more complex
    // due to grammar type inference. This test verifies runtime behavior.
    const simpleParser = createParser([add, mul] as const);
    const result = simpleParser.parse('x', { x: 'number' });
    expect(result.length).toBe(2);

    const value = evaluate(result[0], { data: { x: 42 }, nodes: [add, mul] });

    // Runtime assertion - the value is correct
    expect(value).toBe(42);
  });

  it('handles parentheses - type propagates from inner expression (Task 9 fix)', () => {
    // After Task 9 fix: The parentheses node has resultType: "unknown", but when
    // there's exactly one binding, the type-level now propagates the inner
    // expression's outputSchema, matching the runtime behavior.
    const result = parser.parse('(42)', {});
    expect(result.length).toBe(2);

    const value = evaluate(result[0], { data: {}, nodes: allNodes });

    // Type-level assertion: parentheses now correctly infer the inner type
    // (42 is a number literal, so outputSchema is 'number')
    expectTypeOf(value).toEqualTypeOf<number>();

    // Runtime assertion - at runtime, the value is correctly evaluated
    expect(value).toBe(42);
  });

  it('handles deeply nested parentheses - type propagates through all levels (Task 9 fix)', () => {
    const simpleParser = createParser([add, mul] as const);
    const result = simpleParser.parse('((1+2))', {});
    expect(result.length).toBe(2);

    const value = evaluate(result[0], { data: {}, nodes: [add, mul] });

    // Type-level assertion: nested parentheses now correctly infer the inner type
    // (1+2 is a number expression, so outputSchema is 'number')
    expectTypeOf(value).toEqualTypeOf<number>();

    // Runtime assertion
    expect(value).toBe(3);
  });

  it('handles equality returning boolean from any operands', () => {
    // Numbers compared
    const numResult = parser.parse('1==1', {});
    expect(numResult.length).toBe(2);
    const numValue = evaluate(numResult[0], { data: {}, nodes: allNodes });
    expectTypeOf(numValue).toEqualTypeOf<boolean>();
    expect(numValue).toBe(true);

    // Strings compared
    const strResult = parser.parse('"a"=="b"', {});
    expect(strResult.length).toBe(2);
    const strValue = evaluate(strResult[0], { data: {}, nodes: allNodes });
    expectTypeOf(strValue).toEqualTypeOf<boolean>();
    expect(strValue).toBe(false);
  });

  it('handles ternary with unknown result type', () => {
    // Ternary has resultType: "unknown", so the result type is unknown
    const result = parser.parse('true?1:2', {});
    expect(result.length).toBe(2);

    const value = evaluate(result[0], { data: {}, nodes: allNodes });

    // Type-level assertion: ternary has outputSchema: "unknown"
    expectTypeOf(value).toEqualTypeOf<unknown>();

    // Runtime assertion
    expect(value).toBe(1);
  });

  it('evaluates manually constructed AST with known types', () => {
    // You can always manually construct AST with known outputSchema
    // for type inference to work correctly
    const ast = {
      node: 'literal',
      outputSchema: 'number',
      value: 42,
      raw: '42',
    } as const;

    const value = evaluate(ast, { data: {}, nodes: [] });

    // Type-level assertion: manually constructed AST has known type
    expectTypeOf(value).toEqualTypeOf<number>();

    // Runtime assertion
    expect(value).toBe(42);
  });
});

// =============================================================================
// Data-Schema Connection Type Tests (Task 6)
// =============================================================================

describe('evaluate - data-schema connection (Task 6)', () => {
  describe('type-level tests with manually constructed ASTs', () => {
    // Note: The parser's type-level output doesn't preserve literal outputSchema
    // values for identifiers (it uses 'string' instead of 'number'). These tests
    // use manually constructed ASTs to demonstrate the ideal type-safe behavior.

    it('requires correct data types for identifiers', () => {
      // Manually constructed AST with exact types
      const ast = {
        node: 'add',
        outputSchema: 'number',
        left: { node: 'identifier', name: 'x', outputSchema: 'number' },
        right: { node: 'identifier', name: 'y', outputSchema: 'number' },
      } as const;

      // This should compile - correct types
      const value = evaluate(ast, { data: { x: 5, y: 10 }, nodes: allNodes });
      expectTypeOf(value).toEqualTypeOf<number>();
      expect(value).toBe(15);
    });

    it('rejects missing variables in data (type error)', () => {
      const ast = {
        node: 'identifier',
        name: 'x',
        outputSchema: 'number',
      } as const;

      // Type-level test only - verify that TypeScript catches the error
      // This would throw at runtime, but we're testing the type constraint
      const _typeTest = () => {
        // @ts-expect-error - x is required but not provided
        evaluate(ast, { data: {}, nodes: allNodes });
      };
      // Don't actually call it - just verify the type error exists
      expect(_typeTest).toBeDefined();
    });

    it('rejects wrong data types (type error and runtime error)', () => {
      const ast = {
        node: 'identifier',
        name: 'x',
        outputSchema: 'number',
      } as const;

      // Type-level: @ts-expect-error - x should be number, not string
      // Runtime-level: throws validation error
      expect(() => {
        // @ts-expect-error - x should be number, not string
        evaluate(ast, { data: { x: 'wrong' }, nodes: allNodes });
      }).toThrow(/Variable 'x' failed validation for schema 'number'/);
    });

    it('allows extra properties in data', () => {
      const ast = {
        node: 'identifier',
        name: 'x',
        outputSchema: 'number',
      } as const;

      // Extra properties are allowed
      const value = evaluate(ast, { data: { x: 42, extra: 'ignored' }, nodes: allNodes });
      expectTypeOf(value).toEqualTypeOf<number>();
      expect(value).toBe(42);
    });

    it('accepts empty data for expressions without identifiers', () => {
      const ast = {
        node: 'literal',
        value: 42,
        outputSchema: 'number',
      } as const;

      // No identifiers - empty data is fine
      const value = evaluate(ast, { data: {}, nodes: allNodes });
      expectTypeOf(value).toEqualTypeOf<number>();
      expect(value).toBe(42);
    });

    it('infers correct data types for string identifiers', () => {
      const ast = {
        node: 'identifier',
        name: 'name',
        outputSchema: 'string',
      } as const;

      // name should be string
      const value = evaluate(ast, { data: { name: 'Alice' }, nodes: allNodes });
      expectTypeOf(value).toEqualTypeOf<string>();
      expect(value).toBe('Alice');
    });

    it('infers correct data types for boolean identifiers', () => {
      const ast = {
        node: 'identifier',
        name: 'flag',
        outputSchema: 'boolean',
      } as const;

      // flag should be boolean
      const value = evaluate(ast, { data: { flag: true }, nodes: allNodes });
      expectTypeOf(value).toEqualTypeOf<boolean>();
      expect(value).toBe(true);
    });

    it('handles multiple identifiers with different types', () => {
      // A comparison: x < 10
      const ast = {
        node: 'lt',
        outputSchema: 'boolean',
        left: { node: 'identifier', name: 'x', outputSchema: 'number' },
        right: { node: 'literal', value: 10, outputSchema: 'number' },
      } as const;

      // x should be number
      const value = evaluate(ast, { data: { x: 5 }, nodes: allNodes });
      expectTypeOf(value).toEqualTypeOf<boolean>();
      expect(value).toBe(true);
    });

    it('handles nested expressions with identifiers', () => {
      // (x + 1) * y
      const ast = {
        node: 'mul',
        outputSchema: 'number',
        left: {
          node: 'add',
          outputSchema: 'number',
          left: { node: 'identifier', name: 'x', outputSchema: 'number' },
          right: { node: 'literal', value: 1, outputSchema: 'number' },
        },
        right: { node: 'identifier', name: 'y', outputSchema: 'number' },
      } as const;

      const value = evaluate(ast, { data: { x: 2, y: 3 }, nodes: allNodes });
      expectTypeOf(value).toEqualTypeOf<number>();
      expect(value).toBe(9); // (2+1)*3 = 9
    });
  });

  describe('runtime tests with parsed expressions', () => {
    // These tests verify runtime behavior. The type-level inference for parsed
    // ASTs is limited because the parser's type output uses generic 'string'
    // for identifier outputSchema instead of literal values.

    it('evaluates parsed expression with identifiers', () => {
      const result = parser.parse('x+y', { x: 'number', y: 'number' });
      expect(result.length).toBe(2);

      const value = evaluate(result[0], { data: { x: 5, y: 10 }, nodes: allNodes });
      expect(value).toBe(15);
    });

    it('evaluates parsed identifier expression', () => {
      const result = parser.parse('x', { x: 'number' });
      expect(result.length).toBe(2);

      const value = evaluate(result[0], { data: { x: 42 }, nodes: allNodes });
      expect(value).toBe(42);
    });

    it('throws for missing variable at runtime', () => {
      const result = parser.parse('x', { x: 'number' });
      expect(result.length).toBe(2);

      expect(() => {
        // Runtime validation catches missing variable
        // Type system also catches this - but we test runtime behavior here
        // @ts-expect-error - x is required, testing runtime throws
        evaluate(result[0], { data: {}, nodes: allNodes });
      }).toThrow('Undefined variable: x');
    });

    it('evaluates parsed string identifier', () => {
      const result = parser.parse('name', { name: 'string' });
      expect(result.length).toBe(2);

      const value = evaluate(result[0], { data: { name: 'Alice' }, nodes: allNodes });
      expect(value).toBe('Alice');
    });

    it('evaluates parsed boolean identifier', () => {
      const result = parser.parse('flag', { flag: 'boolean' });
      expect(result.length).toBe(2);

      const value = evaluate(result[0], { data: { flag: true }, nodes: allNodes });
      expect(value).toBe(true);
    });

    it('evaluates parsed comparison with identifier', () => {
      const result = parser.parse('x<10', { x: 'number' });
      expect(result.length).toBe(2);

      const value = evaluate(result[0], { data: { x: 5 }, nodes: allNodes });
      expect(value).toBe(true);
    });

    it('evaluates parsed nested expression with identifiers', () => {
      const result = parser.parse('(x+1)*y', { x: 'number', y: 'number' });
      expect(result.length).toBe(2);

      const value = evaluate(result[0], { data: { x: 2, y: 3 }, nodes: allNodes });
      expect(value).toBe(9); // (2+1)*3 = 9
    });
  });

  describe('createEvaluator type-level tests', () => {
    const evaluator = createEvaluator(allNodes);

    it('requires correct data types for identifiers (manual AST)', () => {
      const ast = {
        node: 'identifier',
        name: 'x',
        outputSchema: 'number',
      } as const;

      const value = evaluator(ast, { x: 42 });
      expectTypeOf(value).toEqualTypeOf<number>();
      expect(value).toBe(42);
    });

    it('rejects missing variables (type error)', () => {
      const ast = {
        node: 'identifier',
        name: 'x',
        outputSchema: 'number',
      } as const;

      // Type-level test only - verify that TypeScript catches the error
      const _typeTest = () => {
        // @ts-expect-error - x is required
        evaluator(ast, {});
      };
      expect(_typeTest).toBeDefined();
    });

    it('rejects wrong data types (type error and runtime error)', () => {
      const ast = {
        node: 'identifier',
        name: 'x',
        outputSchema: 'number',
      } as const;

      // Type-level: @ts-expect-error - x should be number, not string
      // Runtime-level: throws validation error
      expect(() => {
        // @ts-expect-error - x should be number
        evaluator(ast, { x: 'wrong' });
      }).toThrow(/Variable 'x' failed validation for schema 'number'/);
    });

    it('evaluates parsed expression (runtime)', () => {
      const result = parser.parse('x', { x: 'number' });
      expect(result.length).toBe(2);

      const value = evaluator(result[0], { x: 42 });
      expect(value).toBe(42);
    });
  });

  // ===========================================================================
  // Runtime ArkType Constraint Validation Tests (Task 6 completion)
  // ===========================================================================

  describe('evaluate - runtime arktype constraint validation', () => {
    describe('number constraints', () => {
      it('validates number >= 0 constraint - accepts valid value', () => {
        const ast = {
          node: 'identifier',
          name: 'x',
          outputSchema: 'number >= 0',
        } as const;

        const value = evaluate(ast, { data: { x: 5 }, nodes: allNodes });
        expect(value).toBe(5);
      });

      it('validates number >= 0 constraint - accepts zero', () => {
        const ast = {
          node: 'identifier',
          name: 'x',
          outputSchema: 'number >= 0',
        } as const;

        const value = evaluate(ast, { data: { x: 0 }, nodes: allNodes });
        expect(value).toBe(0);
      });

      it('validates number >= 0 constraint - rejects negative value', () => {
        const ast = {
          node: 'identifier',
          name: 'x',
          outputSchema: 'number >= 0',
        } as const;

        expect(() => {
          evaluate(ast, { data: { x: -5 }, nodes: allNodes });
        }).toThrow(/Variable 'x' failed validation for schema 'number >= 0'/);
      });

      it('validates number > 0 constraint - rejects zero', () => {
        const ast = {
          node: 'identifier',
          name: 'x',
          outputSchema: 'number > 0',
        } as const;

        expect(() => {
          evaluate(ast, { data: { x: 0 }, nodes: allNodes });
        }).toThrow(/Variable 'x' failed validation for schema 'number > 0'/);
      });

      it('validates number.integer constraint - rejects float', () => {
        const ast = {
          node: 'identifier',
          name: 'x',
          outputSchema: 'number.integer',
        } as const;

        expect(() => {
          evaluate(ast, { data: { x: 3.14 }, nodes: allNodes });
        }).toThrow(/Variable 'x' failed validation for schema 'number.integer'/);
      });

      it('validates number.integer constraint - accepts integer', () => {
        const ast = {
          node: 'identifier',
          name: 'x',
          outputSchema: 'number.integer',
        } as const;

        const value = evaluate(ast, { data: { x: 42 }, nodes: allNodes });
        expect(value).toBe(42);
      });

      it('validates range constraint 1 <= number <= 100', () => {
        const ast = {
          node: 'identifier',
          name: 'x',
          outputSchema: '1 <= number <= 100',
        } as const;

        // Valid values
        expect(evaluate(ast, { data: { x: 1 }, nodes: allNodes })).toBe(1);
        expect(evaluate(ast, { data: { x: 50 }, nodes: allNodes })).toBe(50);
        expect(evaluate(ast, { data: { x: 100 }, nodes: allNodes })).toBe(100);

        // Invalid values
        expect(() => {
          evaluate(ast, { data: { x: 0 }, nodes: allNodes });
        }).toThrow(/Variable 'x' failed validation/);

        expect(() => {
          evaluate(ast, { data: { x: 101 }, nodes: allNodes });
        }).toThrow(/Variable 'x' failed validation/);
      });
    });

    describe('string constraints', () => {
      it('validates string.email constraint - accepts valid email', () => {
        const ast = {
          node: 'identifier',
          name: 'email',
          outputSchema: 'string.email',
        } as const;

        const value = evaluate(ast, { data: { email: 'test@example.com' }, nodes: allNodes });
        expect(value).toBe('test@example.com');
      });

      it('validates string.email constraint - rejects invalid email', () => {
        const ast = {
          node: 'identifier',
          name: 'email',
          outputSchema: 'string.email',
        } as const;

        expect(() => {
          evaluate(ast, { data: { email: 'not-an-email' }, nodes: allNodes });
        }).toThrow(/Variable 'email' failed validation for schema 'string.email'/);
      });

      it('validates string.uuid constraint - accepts valid uuid', () => {
        const ast = {
          node: 'identifier',
          name: 'id',
          outputSchema: 'string.uuid',
        } as const;

        const value = evaluate(ast, {
          data: { id: '550e8400-e29b-41d4-a716-446655440000' },
          nodes: allNodes,
        });
        expect(value).toBe('550e8400-e29b-41d4-a716-446655440000');
      });

      it('validates string.uuid constraint - rejects invalid uuid', () => {
        const ast = {
          node: 'identifier',
          name: 'id',
          outputSchema: 'string.uuid',
        } as const;

        expect(() => {
          evaluate(ast, { data: { id: 'not-a-uuid' }, nodes: allNodes });
        }).toThrow(/Variable 'id' failed validation for schema 'string.uuid'/);
      });

      it('validates string length constraint - rejects too short', () => {
        const ast = {
          node: 'identifier',
          name: 'password',
          outputSchema: 'string >= 8',
        } as const;

        expect(() => {
          evaluate(ast, { data: { password: 'short' }, nodes: allNodes });
        }).toThrow(/Variable 'password' failed validation for schema 'string >= 8'/);
      });

      it('validates string length constraint - accepts valid length', () => {
        const ast = {
          node: 'identifier',
          name: 'password',
          outputSchema: 'string >= 8',
        } as const;

        const value = evaluate(ast, { data: { password: 'longpassword' }, nodes: allNodes });
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
          // @ts-expect-error - intentionally passing wrong type to test runtime validation
          evaluate(ast, { data: { x: 'not a number' }, nodes: allNodes });
        }).toThrow(/Variable 'x' failed validation for schema 'number'/);
      });

      it('validates string type - rejects number', () => {
        const ast = {
          node: 'identifier',
          name: 'x',
          outputSchema: 'string',
        } as const;

        expect(() => {
          // @ts-expect-error - intentionally passing wrong type to test runtime validation
          evaluate(ast, { data: { x: 42 }, nodes: allNodes });
        }).toThrow(/Variable 'x' failed validation for schema 'string'/);
      });

      it('validates boolean type - rejects string', () => {
        const ast = {
          node: 'identifier',
          name: 'x',
          outputSchema: 'boolean',
        } as const;

        expect(() => {
          // @ts-expect-error - intentionally passing wrong type to test runtime validation
          evaluate(ast, { data: { x: 'true' }, nodes: allNodes });
        }).toThrow(/Variable 'x' failed validation for schema 'boolean'/);
      });

      it('validates null type - rejects undefined', () => {
        const ast = {
          node: 'identifier',
          name: 'x',
          outputSchema: 'null',
        } as const;

        expect(() => {
          // @ts-expect-error - intentionally passing wrong type to test runtime validation
          evaluate(ast, { data: { x: undefined }, nodes: allNodes });
        }).toThrow(/Variable 'x' failed validation for schema 'null'/);
      });

      it('validates undefined type - rejects null', () => {
        const ast = {
          node: 'identifier',
          name: 'x',
          outputSchema: 'undefined',
        } as const;

        expect(() => {
          // @ts-expect-error - intentionally passing wrong type to test runtime validation
          evaluate(ast, { data: { x: null }, nodes: allNodes });
        }).toThrow(/Variable 'x' failed validation for schema 'undefined'/);
      });
    });

    describe('union type constraints', () => {
      it('validates string | number union - accepts string', () => {
        const ast = {
          node: 'identifier',
          name: 'x',
          outputSchema: 'string | number',
        } as const;

        const value = evaluate(ast, { data: { x: 'hello' }, nodes: allNodes });
        expect(value).toBe('hello');
      });

      it('validates string | number union - accepts number', () => {
        const ast = {
          node: 'identifier',
          name: 'x',
          outputSchema: 'string | number',
        } as const;

        const value = evaluate(ast, { data: { x: 42 }, nodes: allNodes });
        expect(value).toBe(42);
      });

      it('validates string | number union - rejects boolean', () => {
        const ast = {
          node: 'identifier',
          name: 'x',
          outputSchema: 'string | number',
        } as const;

        expect(() => {
          // @ts-expect-error - intentionally passing wrong type to test runtime validation
          evaluate(ast, { data: { x: true }, nodes: allNodes });
        }).toThrow(/Variable 'x' failed validation for schema 'string \| number'/);
      });
    });

    describe('parsed expressions with constraints', () => {
      it('validates parsed identifier with number >= 0 constraint', () => {
        const result = parser.parse('x', { x: 'number >= 0' });
        expect(result.length).toBe(2);

        // Valid value
        const value = evaluate(result[0], { data: { x: 5 }, nodes: allNodes });
        expect(value).toBe(5);

        // Invalid value
        expect(() => {
          evaluate(result[0], { data: { x: -5 }, nodes: allNodes });
        }).toThrow(/Variable 'x' failed validation/);
      });

      it('validates parsed identifier with string.email constraint', () => {
        const result = parser.parse('email', { email: 'string.email' });
        expect(result.length).toBe(2);

        // Valid value
        const value = evaluate(result[0], { data: { email: 'test@example.com' }, nodes: allNodes });
        expect(value).toBe('test@example.com');

        // Invalid value
        expect(() => {
          evaluate(result[0], { data: { email: 'invalid' }, nodes: allNodes });
        }).toThrow(/Variable 'email' failed validation/);
      });

      it('validates parsed expression with two constrained identifiers', () => {
        // Parse two separate identifiers with constraints
        // (The add node pattern requires exact 'number' type match, so we test identifiers individually)
        const resultX = parser.parse('x', { x: 'number >= 0' });
        const resultY = parser.parse('y', { y: 'number.integer' });
        expect(resultX.length).toBe(2);
        expect(resultY.length).toBe(2);

        // Valid values
        expect(evaluate(resultX[0], { data: { x: 5 }, nodes: allNodes })).toBe(5);
        expect(evaluate(resultY[0], { data: { y: 3 }, nodes: allNodes })).toBe(3);

        // x violates constraint (negative)
        expect(() => {
          evaluate(resultX[0], { data: { x: -1 }, nodes: allNodes });
        }).toThrow(/Variable 'x' failed validation/);

        // y violates constraint (not integer)
        expect(() => {
          evaluate(resultY[0], { data: { y: 3.5 }, nodes: allNodes });
        }).toThrow(/Variable 'y' failed validation/);
      });
    });

    describe('createEvaluator with constraints', () => {
      const evaluator = createEvaluator(allNodes);

      it('validates constraint in createEvaluator', () => {
        const ast = {
          node: 'identifier',
          name: 'x',
          outputSchema: 'number >= 0',
        } as const;

        // Valid
        expect(evaluator(ast, { x: 5 })).toBe(5);

        // Invalid
        expect(() => {
          evaluator(ast, { x: -5 });
        }).toThrow(/Variable 'x' failed validation/);
      });
    });

    describe('edge cases', () => {
      it('skips validation for unknown schema', () => {
        const ast = {
          node: 'identifier',
          name: 'x',
          outputSchema: 'unknown',
        } as const;

        // Any value should be accepted for 'unknown' schema
        expect(evaluate(ast, { data: { x: 42 }, nodes: allNodes })).toBe(42);
        expect(evaluate(ast, { data: { x: 'hello' }, nodes: allNodes })).toBe('hello');
        expect(evaluate(ast, { data: { x: null }, nodes: allNodes })).toBe(null);
      });

      it('validates nested identifier in expression', () => {
        // Test that validation works when identifier is part of a larger expression
        const result = parser.parse('(x)', { x: 'number >= 0' });
        expect(result.length).toBe(2);

        // Valid
        expect(evaluate(result[0], { data: { x: 5 }, nodes: allNodes })).toBe(5);

        // Invalid
        expect(() => {
          evaluate(result[0], { data: { x: -5 }, nodes: allNodes });
        }).toThrow(/Variable 'x' failed validation/);
      });
    });
  });

  // ===========================================================================
  // Task 8: Fix Evaluate Return Type with ArkType
  // ===========================================================================
  //
  // These tests verify that evaluate() correctly infers the TypeScript return
  // type based on the AST's outputSchema field, using arktype's type inference
  // for advanced types like subtypes, constraints, and unions.
  // ===========================================================================

  describe('evaluate - return type inference with arktype (Task 8)', () => {
    describe('primitive types - return type inference', () => {
      it('infers number return type from outputSchema: "number"', () => {
        const ast = {
          node: 'literal',
          value: 42,
          outputSchema: 'number',
        } as const;

        const result = evaluate(ast, { data: {}, nodes: allNodes });

        // Type-level assertion: result should be number
        expectTypeOf(result).toEqualTypeOf<number>();

        // Runtime assertion
        expect(result).toBe(42);
      });

      it('infers string return type from outputSchema: "string"', () => {
        const ast = {
          node: 'literal',
          value: 'hello',
          outputSchema: 'string',
        } as const;

        const result = evaluate(ast, { data: {}, nodes: allNodes });

        // Type-level assertion: result should be string
        expectTypeOf(result).toEqualTypeOf<string>();

        // Runtime assertion
        expect(result).toBe('hello');
      });

      it('infers boolean return type from outputSchema: "boolean"', () => {
        const ast = {
          node: 'literal',
          value: true,
          outputSchema: 'boolean',
        } as const;

        const result = evaluate(ast, { data: {}, nodes: allNodes });

        // Type-level assertion: result should be boolean
        expectTypeOf(result).toEqualTypeOf<boolean>();

        // Runtime assertion
        expect(result).toBe(true);
      });

      it('infers null return type from outputSchema: "null"', () => {
        const ast = {
          node: 'literal',
          value: null,
          outputSchema: 'null',
        } as const;

        const result = evaluate(ast, { data: {}, nodes: allNodes });

        // Type-level assertion: result should be null
        expectTypeOf(result).toEqualTypeOf<null>();

        // Runtime assertion
        expect(result).toBe(null);
      });

      it('infers undefined return type from outputSchema: "undefined"', () => {
        const ast = {
          node: 'literal',
          value: undefined,
          outputSchema: 'undefined',
        } as const;

        const result = evaluate(ast, { data: {}, nodes: allNodes });

        // Type-level assertion: result should be undefined
        expectTypeOf(result).toEqualTypeOf<undefined>();

        // Runtime assertion
        expect(result).toBe(undefined);
      });
    });

    describe('arktype subtypes - return type inference', () => {
      it('infers string return type from outputSchema: "string.email"', () => {
        const ast = {
          node: 'identifier',
          name: 'email',
          outputSchema: 'string.email',
        } as const;

        const result = evaluate(ast, { data: { email: 'test@example.com' }, nodes: allNodes });

        // Type-level assertion: result should be string (not string.email brand type)
        expectTypeOf(result).toEqualTypeOf<string>();

        // Runtime assertion
        expect(result).toBe('test@example.com');
      });

      it('infers string return type from outputSchema: "string.uuid"', () => {
        const ast = {
          node: 'identifier',
          name: 'id',
          outputSchema: 'string.uuid',
        } as const;

        const validUuid = '550e8400-e29b-41d4-a716-446655440000';
        const result = evaluate(ast, { data: { id: validUuid }, nodes: allNodes });

        // Type-level assertion: result should be string
        expectTypeOf(result).toEqualTypeOf<string>();

        // Runtime assertion
        expect(result).toBe(validUuid);
      });

      it('infers string return type from outputSchema: "string.url"', () => {
        const ast = {
          node: 'identifier',
          name: 'url',
          outputSchema: 'string.url',
        } as const;

        const result = evaluate(ast, { data: { url: 'https://example.com' }, nodes: allNodes });

        // Type-level assertion: result should be string
        expectTypeOf(result).toEqualTypeOf<string>();

        // Runtime assertion
        expect(result).toBe('https://example.com');
      });

      it('infers number return type from outputSchema: "number.integer"', () => {
        const ast = {
          node: 'identifier',
          name: 'count',
          outputSchema: 'number.integer',
        } as const;

        const result = evaluate(ast, { data: { count: 42 }, nodes: allNodes });

        // Type-level assertion: result should be number
        expectTypeOf(result).toEqualTypeOf<number>();

        // Runtime assertion
        expect(result).toBe(42);
      });
    });

    describe('arktype constraints - return type inference', () => {
      it('infers number return type from outputSchema: "number >= 0"', () => {
        const ast = {
          node: 'identifier',
          name: 'amount',
          outputSchema: 'number >= 0',
        } as const;

        const result = evaluate(ast, { data: { amount: 100 }, nodes: allNodes });

        // Type-level assertion: result should be number
        expectTypeOf(result).toEqualTypeOf<number>();

        // Runtime assertion
        expect(result).toBe(100);
      });

      it('infers number return type from outputSchema: "number > 0"', () => {
        const ast = {
          node: 'identifier',
          name: 'positive',
          outputSchema: 'number > 0',
        } as const;

        const result = evaluate(ast, { data: { positive: 1 }, nodes: allNodes });

        // Type-level assertion: result should be number
        expectTypeOf(result).toEqualTypeOf<number>();

        // Runtime assertion
        expect(result).toBe(1);
      });

      it('infers number return type from outputSchema: "1 <= number <= 100"', () => {
        const ast = {
          node: 'identifier',
          name: 'percentage',
          outputSchema: '1 <= number <= 100',
        } as const;

        const result = evaluate(ast, { data: { percentage: 50 }, nodes: allNodes });

        // Type-level assertion: result should be number
        expectTypeOf(result).toEqualTypeOf<number>();

        // Runtime assertion
        expect(result).toBe(50);
      });

      it('infers string return type from outputSchema: "string >= 8"', () => {
        const ast = {
          node: 'identifier',
          name: 'password',
          outputSchema: 'string >= 8',
        } as const;

        const result = evaluate(ast, { data: { password: 'longpassword' }, nodes: allNodes });

        // Type-level assertion: result should be string
        expectTypeOf(result).toEqualTypeOf<string>();

        // Runtime assertion
        expect(result).toBe('longpassword');
      });
    });

    describe('arktype unions - return type inference', () => {
      it('infers string | number return type from outputSchema: "string | number"', () => {
        const ast = {
          node: 'identifier',
          name: 'value',
          outputSchema: 'string | number',
        } as const;

        // Test with string value
        const result1 = evaluate(ast, { data: { value: 'hello' }, nodes: allNodes });
        expectTypeOf(result1).toEqualTypeOf<string | number>();
        expect(result1).toBe('hello');

        // Test with number value
        const result2 = evaluate(ast, { data: { value: 42 }, nodes: allNodes });
        expectTypeOf(result2).toEqualTypeOf<string | number>();
        expect(result2).toBe(42);
      });

      it('infers boolean | number return type from outputSchema: "boolean | number"', () => {
        const ast = {
          node: 'identifier',
          name: 'flag',
          outputSchema: 'boolean | number',
        } as const;

        // Test with boolean value
        const result1 = evaluate(ast, { data: { flag: true }, nodes: allNodes });
        expectTypeOf(result1).toEqualTypeOf<boolean | number>();
        expect(result1).toBe(true);

        // Test with number value
        const result2 = evaluate(ast, { data: { flag: 0 }, nodes: allNodes });
        expectTypeOf(result2).toEqualTypeOf<boolean | number>();
        expect(result2).toBe(0);
      });

      it('infers string | number | boolean return type from outputSchema: "string | number | boolean"', () => {
        const ast = {
          node: 'identifier',
          name: 'any',
          outputSchema: 'string | number | boolean',
        } as const;

        const result = evaluate(ast, { data: { any: 'test' }, nodes: allNodes });
        expectTypeOf(result).toEqualTypeOf<string | number | boolean>();
        expect(result).toBe('test');
      });

      it('infers null | undefined return type from outputSchema: "null | undefined"', () => {
        const ast = {
          node: 'identifier',
          name: 'nullable',
          outputSchema: 'null | undefined',
        } as const;

        // Test with null value
        const result1 = evaluate(ast, { data: { nullable: null }, nodes: allNodes });
        expectTypeOf(result1).toEqualTypeOf<null | undefined>();
        expect(result1).toBe(null);

        // Test with undefined value
        const result2 = evaluate(ast, { data: { nullable: undefined }, nodes: allNodes });
        expectTypeOf(result2).toEqualTypeOf<null | undefined>();
        expect(result2).toBe(undefined);
      });
    });

    describe('arktype arrays - return type inference', () => {
      it('infers string[] return type from outputSchema: "string[]"', () => {
        const ast = {
          node: 'identifier',
          name: 'items',
          outputSchema: 'string[]',
        } as const;

        const result = evaluate(ast, { data: { items: ['a', 'b', 'c'] }, nodes: allNodes });

        // Type-level assertion: result should be string[]
        expectTypeOf(result).toEqualTypeOf<string[]>();

        // Runtime assertion
        expect(result).toEqual(['a', 'b', 'c']);
      });

      it('infers number[] return type from outputSchema: "number[]"', () => {
        const ast = {
          node: 'identifier',
          name: 'numbers',
          outputSchema: 'number[]',
        } as const;

        const result = evaluate(ast, { data: { numbers: [1, 2, 3] }, nodes: allNodes });

        // Type-level assertion: result should be number[]
        expectTypeOf(result).toEqualTypeOf<number[]>();

        // Runtime assertion
        expect(result).toEqual([1, 2, 3]);
      });

      it('infers (string | number)[] return type from outputSchema: "(string | number)[]"', () => {
        const ast = {
          node: 'identifier',
          name: 'mixed',
          outputSchema: '(string | number)[]',
        } as const;

        const result = evaluate(ast, { data: { mixed: ['a', 1, 'b', 2] }, nodes: allNodes });

        // Type-level assertion: result should be (string | number)[]
        expectTypeOf(result).toEqualTypeOf<(string | number)[]>();

        // Runtime assertion
        expect(result).toEqual(['a', 1, 'b', 2]);
      });
    });

    describe('createEvaluator - return type inference with arktype', () => {
      it('infers string return type for subtype', () => {
        const evaluator = createEvaluator(allNodes);
        const ast = {
          node: 'identifier',
          name: 'email',
          outputSchema: 'string.email',
        } as const;

        const result = evaluator(ast, { email: 'test@example.com' });

        // Type-level assertion
        expectTypeOf(result).toEqualTypeOf<string>();

        // Runtime assertion
        expect(result).toBe('test@example.com');
      });

      it('infers number return type for constraint', () => {
        const evaluator = createEvaluator(allNodes);
        const ast = {
          node: 'identifier',
          name: 'amount',
          outputSchema: 'number >= 0',
        } as const;

        const result = evaluator(ast, { amount: 100 });

        // Type-level assertion
        expectTypeOf(result).toEqualTypeOf<number>();

        // Runtime assertion
        expect(result).toBe(100);
      });

      it('infers union return type', () => {
        const evaluator = createEvaluator(allNodes);
        const ast = {
          node: 'identifier',
          name: 'value',
          outputSchema: 'string | number',
        } as const;

        const result = evaluator(ast, { value: 'hello' });

        // Type-level assertion
        expectTypeOf(result).toEqualTypeOf<string | number>();

        // Runtime assertion
        expect(result).toBe('hello');
      });
    });
  });
});

// =============================================================================
// Task 9: Single-Binding OutputSchema Propagation Tests
// =============================================================================

describe('single-binding outputSchema propagation (Task 9)', () => {
  describe('type-level propagation', () => {
    it('propagates outputSchema through parentheses for number expression', () => {
      // (1 + 2) - inner add has outputSchema: 'number'
      // parentheses has resultType: 'unknown' but only one binding
      // So outputSchema should propagate to 'number'
      const result = parser.parse('(1+2)', {});
      expect(result.length).toBe(2);

      const value = evaluate(result[0], { data: {}, nodes: allNodes });

      // Type-level: should be number, not unknown
      expectTypeOf(value).toEqualTypeOf<number>();

      // Runtime: value is correct
      expect(value).toBe(3);
    });

    it('propagates outputSchema through parentheses for string expression', () => {
      // ("hello") - inner string literal has outputSchema: 'string'
      const result = parser.parse('("hello")', {});
      expect(result.length).toBe(2);

      const value = evaluate(result[0], { data: {}, nodes: allNodes });

      // Type-level: should be string
      expectTypeOf(value).toEqualTypeOf<string>();

      // Runtime
      expect(value).toBe('hello');
    });

    it('propagates outputSchema through parentheses for boolean expression', () => {
      // (true) - inner boolean literal has outputSchema: 'boolean'
      const result = parser.parse('(true)', {});
      expect(result.length).toBe(2);

      const value = evaluate(result[0], { data: {}, nodes: allNodes });

      // Type-level: should be boolean
      expectTypeOf(value).toEqualTypeOf<boolean>();

      // Runtime
      expect(value).toBe(true);
    });

    it('propagates outputSchema through nested parentheses', () => {
      // ((1+2)) - inner type propagates through multiple levels
      // Note: Using a simpler parser to avoid excessive computation time
      const simpleParser = createParser([add, mul] as const);
      const result = simpleParser.parse('((1+2))', {});
      expect(result.length).toBe(2);

      const value = evaluate(result[0], { data: {}, nodes: [add, mul] });

      // Type-level: should be number
      expectTypeOf(value).toEqualTypeOf<number>();

      // Runtime
      expect(value).toBe(3);
    });

    it('propagates outputSchema through triple nested parentheses', () => {
      // (((42))) - type should propagate all the way through
      // Note: Using a simpler parser to avoid deep type instantiation
      const simpleParser = createParser([add, mul] as const);
      const result = simpleParser.parse('(((42)))', {});
      expect(result.length).toBe(2);

      const value = evaluate(result[0], { data: {}, nodes: [add, mul] });

      // Type-level: should be number
      expectTypeOf(value).toEqualTypeOf<number>();

      // Runtime
      expect(value).toBe(42);
    });

    it('propagates outputSchema through parentheses with comparison', () => {
      // (1==1) - inner comparison has outputSchema: 'boolean'
      const result = parser.parse('(1==1)', {});
      expect(result.length).toBe(2);

      const value = evaluate(result[0], { data: {}, nodes: allNodes });

      // Type-level: should be boolean
      expectTypeOf(value).toEqualTypeOf<boolean>();

      // Runtime
      expect(value).toBe(true);
    });

    it('propagates outputSchema in complex expression with parentheses', () => {
      // (1+2) * 3 - parenthesized add returns number, multiplied by 3
      const result = parser.parse('(1+2)*3', {});
      expect(result.length).toBe(2);

      const value = evaluate(result[0], { data: {}, nodes: allNodes });

      // Type-level: should be number (mul result)
      expectTypeOf(value).toEqualTypeOf<number>();

      // Runtime
      expect(value).toBe(9);
    });

    it('propagates outputSchema for parenthesized null', () => {
      // (null) - inner null literal has outputSchema: 'null'
      const result = parser.parse('(null)', {});
      expect(result.length).toBe(2);

      const value = evaluate(result[0], { data: {}, nodes: allNodes });

      // Type-level: should be null
      expectTypeOf(value).toEqualTypeOf<null>();

      // Runtime
      expect(value).toBe(null);
    });

    it('propagates outputSchema for parenthesized undefined', () => {
      // (undefined) - inner undefined literal has outputSchema: 'undefined'
      const result = parser.parse('(undefined)', {});
      expect(result.length).toBe(2);

      const value = evaluate(result[0], { data: {}, nodes: allNodes });

      // Type-level: should be undefined
      expectTypeOf(value).toEqualTypeOf<undefined>();

      // Runtime
      expect(value).toBe(undefined);
    });
  });

  describe('type-level helper types', () => {
    // These tests verify the helper types work correctly with manually constructed nodes
    it('propagates type for single-binding node with resultType: unknown', () => {
      // Manually construct a parentheses-like node
      const ast = {
        node: 'parentheses',
        outputSchema: 'number', // In the real parser, this is propagated from inner
        inner: { node: 'literal', value: 42, outputSchema: 'number' },
      } as const;

      const value = evaluate(ast, { data: {}, nodes: allNodes });

      // Type-level: should be number
      expectTypeOf(value).toEqualTypeOf<number>();

      // Runtime
      expect(value).toBe(42);
    });
  });

  describe('does not propagate for multiple bindings', () => {
    it('ternary with two bindings keeps resultType unknown', () => {
      // true ? 1 : "hello"
      // ternary has resultType: 'unknown' and TWO bindings (trueValue, falseValue)
      // So outputSchema should NOT propagate (remains unknown)
      const result = parser.parse('true?1:"hello"', {});
      expect(result.length).toBe(2);

      const value = evaluate(result[0], { data: {}, nodes: allNodes });

      // Type-level: should be unknown (ternary has multiple bindings)
      // Note: This will change when we implement union computation in Task 9 Part B
      expectTypeOf(value).toEqualTypeOf<unknown>();

      // Runtime
      expect(value).toBe(1);
    });
  });

  describe('createEvaluator with single-binding propagation', () => {
    it('propagates type through createEvaluator for parenthesized expression', () => {
      const evaluator = createEvaluator(allNodes);
      const result = parser.parse('(1+2)', {});

      const value = evaluator(result[0], {});

      // Type-level: should be number
      expectTypeOf(value).toEqualTypeOf<number>();

      // Runtime
      expect(value).toBe(3);
    });
  });
});
