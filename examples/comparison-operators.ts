/**
 * Comparison Operators Example
 *
 * This example demonstrates how to create a parser that supports
 * comparison operators (==, !=, <, >, <=, >=) along with arithmetic.
 * This is useful for building condition expressions or filter systems.
 */

import { createParser, defineNode, constVal, lhs, rhs, evaluate } from 'stringent';

// Define grammar nodes
const nodes = [
  // Arithmetic operators (higher precedence)
  defineNode({
    name: 'add',
    pattern: [lhs('number').as('left'), constVal('+'), rhs('number').as('right')],
    precedence: 2,
    resultType: 'number',
    eval: ({ left, right }) => left + right,
  }),
  defineNode({
    name: 'sub',
    pattern: [lhs('number').as('left'), constVal('-'), rhs('number').as('right')],
    precedence: 2,
    resultType: 'number',
    eval: ({ left, right }) => left - right,
  }),
  defineNode({
    name: 'mul',
    pattern: [lhs('number').as('left'), constVal('*'), rhs('number').as('right')],
    precedence: 3,
    resultType: 'number',
    eval: ({ left, right }) => left * right,
  }),

  // Comparison operators (lower precedence - evaluated after arithmetic)
  defineNode({
    name: 'eq',
    pattern: [lhs('number').as('left'), constVal('=='), rhs('number').as('right')],
    precedence: 1,
    resultType: 'boolean',
    eval: ({ left, right }) => left === right,
  }),
  defineNode({
    name: 'neq',
    pattern: [lhs('number').as('left'), constVal('!='), rhs('number').as('right')],
    precedence: 1,
    resultType: 'boolean',
    eval: ({ left, right }) => left !== right,
  }),
  defineNode({
    name: 'lt',
    pattern: [lhs('number').as('left'), constVal('<'), rhs('number').as('right')],
    precedence: 1,
    resultType: 'boolean',
    eval: ({ left, right }) => left < right,
  }),
  defineNode({
    name: 'gt',
    pattern: [lhs('number').as('left'), constVal('>'), rhs('number').as('right')],
    precedence: 1,
    resultType: 'boolean',
    eval: ({ left, right }) => left > right,
  }),
  defineNode({
    name: 'lte',
    pattern: [lhs('number').as('left'), constVal('<='), rhs('number').as('right')],
    precedence: 1,
    resultType: 'boolean',
    eval: ({ left, right }) => left <= right,
  }),
  defineNode({
    name: 'gte',
    pattern: [lhs('number').as('left'), constVal('>='), rhs('number').as('right')],
    precedence: 1,
    resultType: 'boolean',
    eval: ({ left, right }) => left >= right,
  }),
] as const;

// Create the parser
const parser = createParser(nodes);

// Schema for variables
const schema = {
  age: 'number',
  minAge: 'number',
  maxAge: 'number',
  score: 'number',
  threshold: 'number',
} as const;

// Example usage
console.log('=== Comparison Operators Examples ===\n');

// Context with variable values
const context = {
  data: {
    age: 25,
    minAge: 18,
    maxAge: 65,
    score: 85,
    threshold: 70,
  },
  nodes,
};

// Simple comparison
const expr1 = 'age >= minAge';
const [ast1] = parser.parse(expr1, schema);
console.log(`${expr1} = ${evaluate(ast1, context)}`);
// Output: age >= minAge = true (25 >= 18)

// Arithmetic in comparison
const expr2 = 'age + 10 > maxAge';
const [ast2] = parser.parse(expr2, schema);
console.log(`${expr2} = ${evaluate(ast2, context)}`);
// Output: age + 10 > maxAge = false (35 > 65)

// Equality check
const expr3 = 'score - 15 == threshold';
const [ast3] = parser.parse(expr3, schema);
console.log(`${expr3} = ${evaluate(ast3, context)}`);
// Output: score - 15 == threshold = true (70 == 70)

// Not equal
const expr4 = 'age != minAge';
const [ast4] = parser.parse(expr4, schema);
console.log(`${expr4} = ${evaluate(ast4, context)}`);
// Output: age != minAge = true (25 != 18)

// Pure literals
const expr5 = '10 * 2 < 25';
const [ast5] = parser.parse(expr5, {});
console.log(`${expr5} = ${evaluate(ast5, { data: {}, nodes })}`);
// Output: 10 * 2 < 25 = true (20 < 25)

console.log('\n=== Filter System Example ===\n');

// Example: Using comparisons as a simple filter system
type FilterableItem = {
  name: string;
  age: number;
  score: number;
};

const items: FilterableItem[] = [
  { name: 'Alice', age: 25, score: 85 },
  { name: 'Bob', age: 17, score: 92 },
  { name: 'Charlie', age: 30, score: 68 },
  { name: 'Diana', age: 22, score: 75 },
];

// Filter: age >= 18
const filterExpr = 'age >= 18';
const filterSchema = { age: 'number' } as const;
const [filterAst] = parser.parse(filterExpr, filterSchema);

const adults = items.filter((item) =>
  evaluate(filterAst, {
    data: { age: item.age },
    nodes,
  })
);

console.log(`Filter: ${filterExpr}`);
console.log('Matching items:', adults.map((i) => i.name).join(', '));
// Output: Matching items: Alice, Charlie, Diana

// Filter: score > 70
const scoreFilterExpr = 'score > threshold';
const scoreFilterSchema = { score: 'number', threshold: 'number' } as const;
const [scoreFilterAst] = parser.parse(scoreFilterExpr, scoreFilterSchema);

const highScorers = items.filter((item) =>
  evaluate(scoreFilterAst, {
    data: { score: item.score, threshold: 70 },
    nodes,
  })
);

console.log(`\nFilter: ${scoreFilterExpr}`);
console.log('Matching items:', highScorers.map((i) => i.name).join(', '));
// Output: Matching items: Alice, Bob, Diana
