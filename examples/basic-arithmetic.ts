/**
 * Basic Arithmetic Example
 *
 * This example demonstrates how to create a simple arithmetic expression parser
 * that supports addition, subtraction, multiplication, and division with proper
 * operator precedence.
 */

import { createParser, defineNode, constVal, lhs, rhs, evaluate } from 'stringent';

// Define grammar nodes with proper precedence
// Lower precedence numbers = looser binding (evaluated last)
// Higher precedence numbers = tighter binding (evaluated first)
const nodes = [
  // Addition: lowest precedence (1)
  defineNode({
    name: 'add',
    pattern: [lhs('number').as('left'), constVal('+'), rhs('number').as('right')],
    precedence: 1,
    resultType: 'number',
    eval: ({ left, right }) => left + right,
  }),

  // Subtraction: same precedence as addition (1)
  defineNode({
    name: 'sub',
    pattern: [lhs('number').as('left'), constVal('-'), rhs('number').as('right')],
    precedence: 1,
    resultType: 'number',
    eval: ({ left, right }) => left - right,
  }),

  // Multiplication: higher precedence than add/sub (2)
  defineNode({
    name: 'mul',
    pattern: [lhs('number').as('left'), constVal('*'), rhs('number').as('right')],
    precedence: 2,
    resultType: 'number',
    eval: ({ left, right }) => left * right,
  }),

  // Division: same precedence as multiplication (2)
  defineNode({
    name: 'div',
    pattern: [lhs('number').as('left'), constVal('/'), rhs('number').as('right')],
    precedence: 2,
    resultType: 'number',
    eval: ({ left, right }) => left / right,
  }),

  // Exponentiation: highest precedence (3)
  defineNode({
    name: 'pow',
    pattern: [lhs('number').as('base'), constVal('**'), rhs('number').as('exp')],
    precedence: 3,
    resultType: 'number',
    eval: ({ base, exp }) => Math.pow(base, exp),
  }),
] as const;

// Create the parser
const parser = createParser(nodes);

// Evaluation context (no variables needed for pure arithmetic)
const ctx = { data: {}, nodes };

// Example usage
console.log('=== Basic Arithmetic Examples ===\n');

// Simple operations
const expr1 = '2 + 3';
const [ast1] = parser.parse(expr1, {});
console.log(`${expr1} = ${evaluate(ast1, ctx)}`);
// Output: 2 + 3 = 5

// Operator precedence: multiplication before addition
const expr2 = '2 + 3 * 4';
const [ast2] = parser.parse(expr2, {});
console.log(`${expr2} = ${evaluate(ast2, ctx)}`);
// Output: 2 + 3 * 4 = 14 (not 20)

// Parentheses override precedence
const expr3 = '(2 + 3) * 4';
const [ast3] = parser.parse(expr3, {});
console.log(`${expr3} = ${evaluate(ast3, ctx)}`);
// Output: (2 + 3) * 4 = 20

// Complex expression
const expr4 = '2 ** 3 + 4 * 5 - 6 / 2';
const [ast4] = parser.parse(expr4, {});
console.log(`${expr4} = ${evaluate(ast4, ctx)}`);
// Output: 2 ** 3 + 4 * 5 - 6 / 2 = 8 + 20 - 3 = 25

// Chained operations
const expr5 = '1 + 2 + 3 + 4 + 5';
const [ast5] = parser.parse(expr5, {});
console.log(`${expr5} = ${evaluate(ast5, ctx)}`);
// Output: 1 + 2 + 3 + 4 + 5 = 15

// Nested parentheses
const expr6 = '((1 + 2) * (3 + 4))';
const [ast6] = parser.parse(expr6, {});
console.log(`${expr6} = ${evaluate(ast6, ctx)}`);
// Output: ((1 + 2) * (3 + 4)) = 21

console.log('\n=== Type Safety Demo ===\n');

// The parser provides full TypeScript type inference
// Uncomment the following to see type errors at compile time:
// const [badAst] = parser.parse("hello world", {}); // Type error: invalid expression

// AST is fully typed
console.log("AST structure for '2 + 3 * 4':");
console.log(JSON.stringify(ast2, null, 2));
