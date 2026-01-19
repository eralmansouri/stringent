/**
 * Custom Operators Example
 *
 * This example demonstrates how to create custom domain-specific operators
 * beyond the standard arithmetic and comparison operators. This shows the
 * flexibility of Stringent for building DSLs (Domain Specific Languages).
 */

import { createParser, defineNode, constVal, lhs, rhs, evaluate } from 'stringent';

// =============================================================================
// Example 1: String Operations DSL
// =============================================================================

const stringNodes = [
  // String concatenation with ++
  defineNode({
    name: 'concat',
    pattern: [lhs('string').as('left'), constVal('++'), rhs('string').as('right')],
    precedence: 1,
    resultType: 'string',
    eval: ({ left, right }) => String(left) + String(right),
  }),

  // String repeat: "abc" ** 3 => "abcabcabc"
  defineNode({
    name: 'repeat',
    pattern: [lhs('string').as('str'), constVal('**'), rhs('number').as('times')],
    precedence: 2,
    resultType: 'string',
    eval: ({ str, times }) => String(str).repeat(Number(times)),
  }),

  // String uppercase: UPPER "hello" => "HELLO"
  defineNode({
    name: 'upper',
    pattern: [constVal('UPPER'), rhs('string').as('str')],
    precedence: 3,
    resultType: 'string',
    eval: ({ str }) => String(str).toUpperCase(),
  }),

  // String lowercase: LOWER "HELLO" => "hello"
  defineNode({
    name: 'lower',
    pattern: [constVal('LOWER'), rhs('string').as('str')],
    precedence: 3,
    resultType: 'string',
    eval: ({ str }) => String(str).toLowerCase(),
  }),

  // String reverse: REVERSE "hello" => "olleh"
  defineNode({
    name: 'reverse',
    pattern: [constVal('REVERSE'), rhs('string').as('str')],
    precedence: 3,
    resultType: 'string',
    eval: ({ str }) => String(str).split('').reverse().join(''),
  }),
] as const;

const stringParser = createParser(stringNodes);

console.log('=== String Operations DSL ===\n');

// Concatenation
const strExpr1 = '"Hello" ++ " " ++ "World"';
const [strAst1] = stringParser.parse(strExpr1, {});
console.log(`${strExpr1} = "${evaluate(strAst1, { data: {}, nodes: stringNodes })}"`);

// Repeat
const strExpr2 = '"abc" ** 3';
const [strAst2] = stringParser.parse(strExpr2, {});
console.log(`${strExpr2} = "${evaluate(strAst2, { data: {}, nodes: stringNodes })}"`);

// Uppercase
const strExpr3 = 'UPPER "hello"';
const [strAst3] = stringParser.parse(strExpr3, {});
console.log(`${strExpr3} = "${evaluate(strAst3, { data: {}, nodes: stringNodes })}"`);

// Combined: uppercase then concat
const strExpr4 = 'UPPER "hello" ++ " " ++ UPPER "world"';
const [strAst4] = stringParser.parse(strExpr4, {});
console.log(`${strExpr4} = "${evaluate(strAst4, { data: {}, nodes: stringNodes })}"`);

// Reverse
const strExpr5 = 'REVERSE "hello"';
const [strAst5] = stringParser.parse(strExpr5, {});
console.log(`${strExpr5} = "${evaluate(strAst5, { data: {}, nodes: stringNodes })}"`);

// =============================================================================
// Example 2: Set Operations DSL
// =============================================================================

// Note: For this example, we use number to represent set membership checking
// In a real implementation, you might use custom types

const setNodes = [
  // IN operator: value IN set (checking membership)
  // Simplified: checks if left divides right evenly
  defineNode({
    name: 'divides',
    pattern: [lhs('number').as('left'), constVal('divides'), rhs('number').as('right')],
    precedence: 1,
    resultType: 'boolean',
    eval: ({ left, right }) => Number(right) % Number(left) === 0,
  }),

  // BETWEEN operator: value BETWEEN low AND high
  // We'll simulate this with a simpler version
  defineNode({
    name: 'between',
    pattern: [
      lhs('number').as('value'),
      constVal('between'),
      rhs('number').as('low'),
      constVal('and'),
      rhs('number').as('high'),
    ],
    precedence: 1,
    resultType: 'boolean',
    eval: ({ value, low, high }) => {
      const v = Number(value);
      return v >= Number(low) && v <= Number(high);
    },
  }),

  // Arithmetic for sub-expressions
  defineNode({
    name: 'add',
    pattern: [lhs('number').as('left'), constVal('+'), rhs('number').as('right')],
    precedence: 2,
    resultType: 'number',
    eval: ({ left, right }) => Number(left) + Number(right),
  }),
] as const;

const setParser = createParser(setNodes);

console.log('\n=== Custom Operators DSL ===\n');

// Check if 3 divides 12
const setExpr1 = '3 divides 12';
const [setAst1] = setParser.parse(setExpr1, {});
console.log(`${setExpr1} = ${evaluate(setAst1, { data: {}, nodes: setNodes })}`);

// Check if 5 divides 12
const setExpr2 = '5 divides 12';
const [setAst2] = setParser.parse(setExpr2, {});
console.log(`${setExpr2} = ${evaluate(setAst2, { data: {}, nodes: setNodes })}`);

// Between check
const setExpr3 = '5 between 1 and 10';
const [setAst3] = setParser.parse(setExpr3, {});
console.log(`${setExpr3} = ${evaluate(setAst3, { data: {}, nodes: setNodes })}`);

// Between with arithmetic
const setExpr4 = '3 + 4 between 5 and 10';
const [setAst4] = setParser.parse(setExpr4, {});
console.log(`${setExpr4} = ${evaluate(setAst4, { data: {}, nodes: setNodes })}`);

// =============================================================================
// Example 3: Nullish Coalescing DSL
// =============================================================================

const nullishNodes = [
  // Nullish coalescing: left ?? right (returns right if left is null/undefined)
  defineNode({
    name: 'nullCoalesce',
    pattern: [lhs('number').as('left'), constVal('??'), rhs('number').as('right')],
    precedence: 1,
    resultType: 'number',
    eval: ({ left, right }) => left ?? right,
  }),

  // Addition for completeness
  defineNode({
    name: 'add',
    pattern: [lhs('number').as('left'), constVal('+'), rhs('number').as('right')],
    precedence: 2,
    resultType: 'number',
    eval: ({ left, right }) => Number(left) + Number(right),
  }),
] as const;

const nullishParser = createParser(nullishNodes);

console.log('\n=== Nullish Coalescing ===\n');

// With variables from context
const nullishSchema = { value: 'number', defaultVal: 'number' } as const;
const nullishExpr = 'value ?? defaultVal';
const [nullishAst] = nullishParser.parse(nullishExpr, nullishSchema);

// With a value
console.log(
  `${nullishExpr} (value=5, default=10) = ${evaluate(nullishAst, {
    data: { value: 5, defaultVal: 10 },
    nodes: nullishNodes,
  })}`
);

// With arithmetic
const nullishExpr2 = 'value ?? 10 + 5';
const [nullishAst2] = nullishParser.parse(nullishExpr2, { value: 'number' });
console.log(
  `${nullishExpr2} (value=3) = ${evaluate(nullishAst2, {
    data: { value: 3 },
    nodes: nullishNodes,
  })}`
);

// =============================================================================
// Example 4: Unit Conversion DSL
// =============================================================================

const unitNodes = [
  // Convert kilometers to miles: km TO miles
  defineNode({
    name: 'kmToMiles',
    pattern: [lhs('number').as('km'), constVal('km'), constVal('to'), constVal('miles')],
    precedence: 1,
    resultType: 'number',
    eval: ({ km }) => Number(km) * 0.621371,
  }),

  // Convert celsius to fahrenheit: celsius TO fahrenheit
  defineNode({
    name: 'celsiusToFahrenheit',
    pattern: [lhs('number').as('c'), constVal('C'), constVal('to'), constVal('F')],
    precedence: 1,
    resultType: 'number',
    eval: ({ c }) => (Number(c) * 9) / 5 + 32,
  }),

  // Convert pounds to kilograms
  defineNode({
    name: 'lbsToKg',
    pattern: [lhs('number').as('lbs'), constVal('lbs'), constVal('to'), constVal('kg')],
    precedence: 1,
    resultType: 'number',
    eval: ({ lbs }) => Number(lbs) * 0.453592,
  }),
] as const;

const unitParser = createParser(unitNodes);

console.log('\n=== Unit Conversion DSL ===\n');

// Kilometers to miles
const unitExpr1 = '100 km to miles';
const [unitAst1] = unitParser.parse(unitExpr1, {});
console.log(
  `${unitExpr1} = ${(evaluate(unitAst1, { data: {}, nodes: unitNodes }) as number).toFixed(2)}`
);

// Celsius to Fahrenheit
const unitExpr2 = '25 C to F';
const [unitAst2] = unitParser.parse(unitExpr2, {});
console.log(`${unitExpr2} = ${evaluate(unitAst2, { data: {}, nodes: unitNodes })}`);

// Pounds to kilograms
const unitExpr3 = '150 lbs to kg';
const [unitAst3] = unitParser.parse(unitExpr3, {});
console.log(
  `${unitExpr3} = ${(evaluate(unitAst3, { data: {}, nodes: unitNodes }) as number).toFixed(2)}`
);

console.log('\n=== Summary ===');
console.log('Stringent allows you to define custom operators for any domain:');
console.log('- String manipulation (++, **, UPPER, LOWER, REVERSE)');
console.log('- Domain-specific checks (divides, between)');
console.log('- Nullish coalescing (??)');
console.log('- Unit conversions (km to miles, C to F)');
console.log('All with full TypeScript type safety!');
