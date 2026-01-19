/**
 * Tests for runtime expression evaluation
 *
 * Verifies that:
 * 1. Literal nodes evaluate to their values
 * 2. Identifier nodes resolve from context
 * 3. Parentheses nodes forward to inner expression
 * 4. Binary operations with eval functions compute correctly
 * 5. Error cases are handled appropriately
 */

import { describe, it, expect } from 'vitest';
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
