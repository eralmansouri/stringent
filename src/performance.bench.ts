/**
 * Performance Benchmarks for Stringent Parser
 *
 * This file contains benchmarks to measure and document the performance
 * characteristics of the runtime parser.
 *
 * Run with: pnpm bench
 */

import { bench, describe } from 'vitest';
import { createParser, defineNode, constVal, lhs, rhs, expr } from './index.js';

// =============================================================================
// Test Grammar Setup
// =============================================================================

// Basic arithmetic grammar
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

const pow = defineNode({
  name: 'pow',
  pattern: [lhs('number').as('left'), constVal('**'), rhs('number').as('right')],
  precedence: 3,
  resultType: 'number',
});

const sub = defineNode({
  name: 'sub',
  pattern: [lhs('number').as('left'), constVal('-'), rhs('number').as('right')],
  precedence: 1,
  resultType: 'number',
});

const div = defineNode({
  name: 'div',
  pattern: [lhs('number').as('left'), constVal('/'), rhs('number').as('right')],
  precedence: 2,
  resultType: 'number',
});

// Comparison operators
const eq = defineNode({
  name: 'eq',
  pattern: [lhs().as('left'), constVal('=='), rhs().as('right')],
  precedence: 0,
  resultType: 'boolean',
});

// String operations
const concat = defineNode({
  name: 'concat',
  pattern: [lhs('string').as('left'), constVal('++'), rhs('string').as('right')],
  precedence: 1,
  resultType: 'string',
});

// Ternary
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
});

// Create parsers
const arithmeticParser = createParser([add, sub, mul, div, pow]);
const fullParser = createParser([add, sub, mul, div, pow, eq, concat, ternary]);

// =============================================================================
// Test Data Generation
// =============================================================================

/** Generate a simple number literal */
function simpleNumber(): string {
  return String(Math.floor(Math.random() * 1000));
}

/** Generate a chained addition expression */
function chainedAddition(count: number): string {
  return Array.from({ length: count }, () => simpleNumber()).join(' + ');
}

/** Generate a chained multiplication expression */
function chainedMultiplication(count: number): string {
  return Array.from({ length: count }, () => simpleNumber()).join(' * ');
}

/** Generate a mixed precedence expression */
function mixedPrecedence(count: number): string {
  const ops = ['+', '-', '*', '/', '**'];
  let expr = simpleNumber();
  for (let i = 0; i < count - 1; i++) {
    const op = ops[i % ops.length];
    expr += ` ${op} ${simpleNumber()}`;
  }
  return expr;
}

/** Generate nested parentheses */
function nestedParens(depth: number): string {
  let expr = simpleNumber();
  for (let i = 0; i < depth; i++) {
    expr = `(${expr})`;
  }
  return expr;
}

/** Generate expression with nested parentheses and operations */
function nestedParensWithOps(depth: number): string {
  let expr = simpleNumber();
  for (let i = 0; i < depth; i++) {
    expr = `(${expr} + ${simpleNumber()})`;
  }
  return expr;
}

// =============================================================================
// Benchmarks: Simple Literals
// =============================================================================

describe('Simple Literals', () => {
  bench('number literal', () => {
    arithmeticParser.parse('42');
  });

  bench('decimal number', () => {
    arithmeticParser.parse('3.14159');
  });

  bench('large number', () => {
    arithmeticParser.parse('9007199254740991');
  });

  bench('string literal (double quotes)', () => {
    fullParser.parse('"hello world"');
  });

  bench('string literal (single quotes)', () => {
    fullParser.parse("'hello world'");
  });

  bench('identifier', () => {
    arithmeticParser.parse('variableName', { data: { variableName: 'number' } });
  });
});

// =============================================================================
// Benchmarks: Binary Operations
// =============================================================================

describe('Binary Operations', () => {
  bench('simple addition: 1 + 2', () => {
    arithmeticParser.parse('1 + 2');
  });

  bench('simple multiplication: 3 * 4', () => {
    arithmeticParser.parse('3 * 4');
  });

  bench('simple exponentiation: 2 ** 8', () => {
    arithmeticParser.parse('2 ** 8');
  });

  bench('mixed precedence: 1 + 2 * 3', () => {
    arithmeticParser.parse('1 + 2 * 3');
  });

  bench('mixed precedence: 2 * 3 + 4 * 5', () => {
    arithmeticParser.parse('2 * 3 + 4 * 5');
  });

  bench('three precedence levels: 1 + 2 * 3 ** 4', () => {
    arithmeticParser.parse('1 + 2 * 3 ** 4');
  });
});

// =============================================================================
// Benchmarks: Chained Operations
// =============================================================================

describe('Chained Operations', () => {
  const chain5 = chainedAddition(5);
  const chain10 = chainedAddition(10);
  const chain20 = chainedAddition(20);
  const chain50 = chainedAddition(50);

  bench('5-element addition chain', () => {
    arithmeticParser.parse(chain5);
  });

  bench('10-element addition chain', () => {
    arithmeticParser.parse(chain10);
  });

  bench('20-element addition chain', () => {
    arithmeticParser.parse(chain20);
  });

  bench('50-element addition chain', () => {
    arithmeticParser.parse(chain50);
  });

  const mulChain10 = chainedMultiplication(10);
  const mulChain20 = chainedMultiplication(20);

  bench('10-element multiplication chain', () => {
    arithmeticParser.parse(mulChain10);
  });

  bench('20-element multiplication chain', () => {
    arithmeticParser.parse(mulChain20);
  });

  const mixed10 = mixedPrecedence(10);
  const mixed20 = mixedPrecedence(20);

  bench('10-element mixed precedence', () => {
    arithmeticParser.parse(mixed10);
  });

  bench('20-element mixed precedence', () => {
    arithmeticParser.parse(mixed20);
  });
});

// =============================================================================
// Benchmarks: Nested Parentheses
// =============================================================================

describe('Nested Parentheses', () => {
  const parens5 = nestedParens(5);
  const parens10 = nestedParens(10);
  const parens20 = nestedParens(20);

  bench('5 levels of nesting', () => {
    arithmeticParser.parse(parens5);
  });

  bench('10 levels of nesting', () => {
    arithmeticParser.parse(parens10);
  });

  bench('20 levels of nesting', () => {
    arithmeticParser.parse(parens20);
  });

  const parensOps5 = nestedParensWithOps(5);
  const parensOps10 = nestedParensWithOps(10);
  const parensOps20 = nestedParensWithOps(20);

  bench('5 levels with operations', () => {
    arithmeticParser.parse(parensOps5);
  });

  bench('10 levels with operations', () => {
    arithmeticParser.parse(parensOps10);
  });

  bench('20 levels with operations', () => {
    arithmeticParser.parse(parensOps20);
  });
});

// =============================================================================
// Benchmarks: Complex Expressions
// =============================================================================

describe('Complex Expressions', () => {
  bench('precedence override: (1 + 2) * 3', () => {
    arithmeticParser.parse('(1 + 2) * 3');
  });

  bench('nested groups: ((1 + 2) * 3) + 4', () => {
    arithmeticParser.parse('((1 + 2) * 3) + 4');
  });

  bench('complex: (1 + 2) * (3 + 4)', () => {
    arithmeticParser.parse('(1 + 2) * (3 + 4)');
  });

  bench('very complex: ((1 + 2) * 3 + 4) ** 2 / (5 - 6)', () => {
    arithmeticParser.parse('((1 + 2) * 3 + 4) ** 2 / (5 - 6)');
  });
});

// =============================================================================
// Benchmarks: Parser Creation
// =============================================================================

describe('Parser Creation', () => {
  bench('create simple parser (1 node)', () => {
    createParser([add]);
  });

  bench('create medium parser (5 nodes)', () => {
    createParser([add, sub, mul, div, pow]);
  });

  bench('create full parser (8 nodes)', () => {
    createParser([add, sub, mul, div, pow, eq, concat, ternary]);
  });
});

// =============================================================================
// Benchmarks: Grammar Complexity
// =============================================================================

describe('Grammar Complexity', () => {
  // Create parsers with varying numbers of operators at the same precedence
  const samePrec2 = createParser([
    defineNode({
      name: 'op1',
      pattern: [lhs('number').as('l'), constVal('|1|'), rhs('number').as('r')],
      precedence: 1,
      resultType: 'number',
    }),
    defineNode({
      name: 'op2',
      pattern: [lhs('number').as('l'), constVal('|2|'), rhs('number').as('r')],
      precedence: 1,
      resultType: 'number',
    }),
  ]);

  const samePrec5 = createParser([
    defineNode({
      name: 'op1',
      pattern: [lhs('number').as('l'), constVal('|1|'), rhs('number').as('r')],
      precedence: 1,
      resultType: 'number',
    }),
    defineNode({
      name: 'op2',
      pattern: [lhs('number').as('l'), constVal('|2|'), rhs('number').as('r')],
      precedence: 1,
      resultType: 'number',
    }),
    defineNode({
      name: 'op3',
      pattern: [lhs('number').as('l'), constVal('|3|'), rhs('number').as('r')],
      precedence: 1,
      resultType: 'number',
    }),
    defineNode({
      name: 'op4',
      pattern: [lhs('number').as('l'), constVal('|4|'), rhs('number').as('r')],
      precedence: 1,
      resultType: 'number',
    }),
    defineNode({
      name: 'op5',
      pattern: [lhs('number').as('l'), constVal('|5|'), rhs('number').as('r')],
      precedence: 1,
      resultType: 'number',
    }),
  ]);

  bench('2 ops at same precedence - first op', () => {
    samePrec2.parse('1 |1| 2');
  });

  bench('2 ops at same precedence - second op', () => {
    samePrec2.parse('1 |2| 2');
  });

  bench('5 ops at same precedence - first op', () => {
    samePrec5.parse('1 |1| 2');
  });

  bench('5 ops at same precedence - fifth op', () => {
    samePrec5.parse('1 |5| 2');
  });

  bench('5 ops at same precedence - number literal only', () => {
    samePrec5.parse('42');
  });
});

// =============================================================================
// Benchmarks: String Parsing
// =============================================================================

describe('String Parsing', () => {
  const stringParser = createParser([concat]);

  const shortStr = '"hello"';
  const mediumStr = '"' + 'a'.repeat(100) + '"';
  const longStr = '"' + 'a'.repeat(1000) + '"';

  bench('short string (5 chars)', () => {
    stringParser.parse(shortStr);
  });

  bench('medium string (100 chars)', () => {
    stringParser.parse(mediumStr);
  });

  bench('long string (1000 chars)', () => {
    stringParser.parse(longStr);
  });

  const escapedStr = '"hello\\nworld\\t\\u0041"';
  bench('string with escapes', () => {
    stringParser.parse(escapedStr);
  });

  bench('string concatenation', () => {
    stringParser.parse('"hello" ++ "world"');
  });
});

// =============================================================================
// Benchmarks: Context Resolution
// =============================================================================

describe('Context Resolution', () => {
  const smallContext = { data: { x: 'number' } };
  const mediumContext = {
    data: {
      a: 'number',
      b: 'number',
      c: 'number',
      d: 'number',
      e: 'number',
      x: 'number',
    },
  };
  const largeContext = {
    data: Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`var${i}`, 'number'])),
  };
  (largeContext.data as Record<string, string>)['x'] = 'number';

  bench('small context - identifier lookup', () => {
    arithmeticParser.parse('x', smallContext);
  });

  bench('medium context - identifier lookup', () => {
    arithmeticParser.parse('x', mediumContext);
  });

  bench('large context - identifier lookup', () => {
    arithmeticParser.parse('x', largeContext);
  });

  bench('context - expression with identifiers', () => {
    arithmeticParser.parse('x + x * x', smallContext);
  });
});
