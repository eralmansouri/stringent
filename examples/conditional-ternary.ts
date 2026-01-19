/**
 * Conditional (Ternary) Expression Example
 *
 * This example demonstrates how to implement ternary conditional expressions
 * (condition ? trueValue : falseValue) along with comparisons and arithmetic.
 */

import { createParser, defineNode, constVal, lhs, rhs, expr, evaluate } from 'stringent';

// Define grammar nodes
const nodes = [
  // Ternary conditional: condition ? trueValue : falseValue
  // Lowest precedence - evaluated last
  defineNode({
    name: 'ternary',
    pattern: [
      lhs('boolean').as('condition'),
      constVal('?'),
      expr('number').as('trueValue'), // Number branches for type safety
      constVal(':'),
      rhs('number').as('falseValue'),
    ],
    precedence: 0,
    resultType: 'number',
    eval: ({ condition, trueValue, falseValue }) => (condition ? trueValue : falseValue),
  }),

  // Comparison operators
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

  // Arithmetic operators
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
  defineNode({
    name: 'div',
    pattern: [lhs('number').as('left'), constVal('/'), rhs('number').as('right')],
    precedence: 3,
    resultType: 'number',
    eval: ({ left, right }) => left / right,
  }),
] as const;

// Create the parser
const parser = createParser(nodes);

// Schema for variables
const schema = {
  score: 'number',
  threshold: 'number',
  bonus: 'number',
  penalty: 'number',
  value: 'number',
  min: 'number',
  max: 'number',
} as const;

// Example usage
console.log('=== Conditional Expression Examples ===\n');

// Context with variable values
const ctx = {
  data: {
    score: 85,
    threshold: 70,
    bonus: 10,
    penalty: 5,
    value: 50,
    min: 0,
    max: 100,
  },
  nodes,
};

// Basic ternary: score >= threshold ? bonus : penalty
const expr1 = 'score >= threshold ? bonus : penalty';
const [ast1] = parser.parse(expr1, schema);
const result1 = evaluate(ast1, ctx);
console.log(`${expr1}`);
console.log(`Result: ${result1}`); // 10 (score 85 >= 70)

// Ternary with literals
const expr2 = 'score > 90 ? 100 : 50';
const [ast2] = parser.parse(expr2, schema);
const result2 = evaluate(ast2, ctx);
console.log(`\n${expr2}`);
console.log(`Result: ${result2}`); // 50 (85 is not > 90)

// Arithmetic in ternary branches
const expr3 = 'score >= threshold ? score + bonus : score - penalty';
const [ast3] = parser.parse(expr3, schema);
const result3 = evaluate(ast3, ctx);
console.log(`\n${expr3}`);
console.log(`Result: ${result3}`); // 95 (85 + 10)

// Arithmetic in condition
const expr4 = 'score + 10 > 90 ? 1 : 0';
const [ast4] = parser.parse(expr4, schema);
const result4 = evaluate(ast4, ctx);
console.log(`\n${expr4}`);
console.log(`Result: ${result4}`); // 1 (95 > 90)

// Nested ternary with parentheses
const expr5 = 'score >= 90 ? 100 : (score >= 70 ? 75 : 50)';
const [ast5] = parser.parse(expr5, schema);
const result5 = evaluate(ast5, ctx);
console.log(`\n${expr5}`);
console.log(`Result: ${result5}`); // 75 (85 is between 70 and 90)

console.log('\n=== Grade Calculator ===\n');

// Calculate letter grade based on score
function calculateGrade(score: number): string {
  // Use nested ternary to determine grade
  const gradeSchema = { score: 'number' } as const;

  // A >= 90, B >= 80, C >= 70, D >= 60, F < 60
  // We'll evaluate each threshold
  const isA = 'score >= 90 ? 1 : 0';
  const isB = 'score >= 80 ? 1 : 0';
  const isC = 'score >= 70 ? 1 : 0';
  const isD = 'score >= 60 ? 1 : 0';

  const [astA] = parser.parse(isA, gradeSchema);
  const [astB] = parser.parse(isB, gradeSchema);
  const [astC] = parser.parse(isC, gradeSchema);
  const [astD] = parser.parse(isD, gradeSchema);

  const evalCtx = { data: { score }, nodes };

  if (evaluate(astA, evalCtx)) return 'A';
  if (evaluate(astB, evalCtx)) return 'B';
  if (evaluate(astC, evalCtx)) return 'C';
  if (evaluate(astD, evalCtx)) return 'D';
  return 'F';
}

// Test grade calculation
const testScores = [95, 85, 75, 65, 55];
for (const score of testScores) {
  console.log(`Score: ${score} -> Grade: ${calculateGrade(score)}`);
}

console.log('\n=== Clamping Values ===\n');

// Clamp a value between min and max using ternary
// value < min ? min : (value > max ? max : value)
const clampExpr = 'value < min ? min : (value > max ? max : value)';
const clampSchema = { value: 'number', min: 'number', max: 'number' } as const;
const [clampAst] = parser.parse(clampExpr, clampSchema);

const testValues = [-10, 50, 150];
for (const value of testValues) {
  const clampedCtx = {
    data: { value, min: 0, max: 100 },
    nodes,
  };
  const clamped = evaluate(clampAst, clampedCtx);
  console.log(`clamp(${value}, 0, 100) = ${clamped}`);
}
// Output:
// clamp(-10, 0, 100) = 0
// clamp(50, 0, 100) = 50
// clamp(150, 0, 100) = 100
