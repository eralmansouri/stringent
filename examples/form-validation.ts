/**
 * Form Validation Example
 *
 * This example demonstrates how to use Stringent for form validation rules.
 * It creates a parser that can evaluate expressions like:
 * - "password == confirmPassword" (field equality)
 * - "age >= 18" (minimum value)
 * - "length > 0" (required field)
 */

import {
  createParser,
  defineNode,
  constVal,
  lhs,
  rhs,
  evaluate,
} from "stringent";

// Define grammar nodes for validation expressions
const nodes = [
  // String equality
  defineNode({
    name: "strEq",
    pattern: [lhs("string").as("left"), constVal("=="), rhs("string").as("right")],
    precedence: 1,
    resultType: "boolean",
    eval: ({ left, right }) => left === right,
  }),

  // String inequality
  defineNode({
    name: "strNeq",
    pattern: [lhs("string").as("left"), constVal("!="), rhs("string").as("right")],
    precedence: 1,
    resultType: "boolean",
    eval: ({ left, right }) => left !== right,
  }),

  // Number comparisons
  defineNode({
    name: "numEq",
    pattern: [lhs("number").as("left"), constVal("=="), rhs("number").as("right")],
    precedence: 1,
    resultType: "boolean",
    eval: ({ left, right }) => left === right,
  }),
  defineNode({
    name: "numGte",
    pattern: [lhs("number").as("left"), constVal(">="), rhs("number").as("right")],
    precedence: 1,
    resultType: "boolean",
    eval: ({ left, right }) => left >= right,
  }),
  defineNode({
    name: "numGt",
    pattern: [lhs("number").as("left"), constVal(">"), rhs("number").as("right")],
    precedence: 1,
    resultType: "boolean",
    eval: ({ left, right }) => left > right,
  }),
  defineNode({
    name: "numLte",
    pattern: [lhs("number").as("left"), constVal("<="), rhs("number").as("right")],
    precedence: 1,
    resultType: "boolean",
    eval: ({ left, right }) => left <= right,
  }),
  defineNode({
    name: "numLt",
    pattern: [lhs("number").as("left"), constVal("<"), rhs("number").as("right")],
    precedence: 1,
    resultType: "boolean",
    eval: ({ left, right }) => left < right,
  }),

  // Logical AND
  defineNode({
    name: "and",
    pattern: [lhs("boolean").as("left"), constVal("&&"), rhs("boolean").as("right")],
    precedence: 0, // Lower than comparisons
    resultType: "boolean",
    eval: ({ left, right }) => left && right,
  }),

  // Logical OR
  defineNode({
    name: "or",
    pattern: [lhs("boolean").as("left"), constVal("||"), rhs("boolean").as("right")],
    precedence: 0,
    resultType: "boolean",
    eval: ({ left, right }) => left || right,
  }),

  // String contains (using custom operator)
  defineNode({
    name: "contains",
    pattern: [lhs("string").as("haystack"), constVal("contains"), rhs("string").as("needle")],
    precedence: 2,
    resultType: "boolean",
    eval: ({ haystack, needle }) => String(haystack).includes(String(needle)),
  }),

  // String starts with
  defineNode({
    name: "startsWith",
    pattern: [lhs("string").as("str"), constVal("startsWith"), rhs("string").as("prefix")],
    precedence: 2,
    resultType: "boolean",
    eval: ({ str, prefix }) => String(str).startsWith(String(prefix)),
  }),

  // String length (property access simulation)
  defineNode({
    name: "length",
    pattern: [lhs("string").as("str"), constVal(".length")],
    precedence: 3,
    resultType: "number",
    eval: ({ str }) => String(str).length,
  }),
] as const;

// Create the parser
const parser = createParser(nodes);

// Example usage
console.log("=== Form Validation Examples ===\n");

// Define a form schema
const formSchema = {
  password: "string",
  confirmPassword: "string",
  email: "string",
  age: "number",
  username: "string",
} as const;

// Test form data
const formData = {
  password: "secret123",
  confirmPassword: "secret123",
  email: "user@example.com",
  age: 25,
  username: "john_doe",
};

const ctx = { data: formData, nodes };

// Validation 1: Password confirmation
const rule1 = "password == confirmPassword";
const [ast1] = parser.parse(rule1, formSchema);
const isValid1 = evaluate(ast1, ctx);
console.log(`Rule: ${rule1}`);
console.log(`Valid: ${isValid1}`); // true

// Validation 2: Age requirement
const rule2 = "age >= 18";
const [ast2] = parser.parse(rule2, formSchema);
const isValid2 = evaluate(ast2, ctx);
console.log(`\nRule: ${rule2}`);
console.log(`Valid: ${isValid2}`); // true

// Validation 3: Email contains @
const rule3 = 'email contains "@"';
const [ast3] = parser.parse(rule3, formSchema);
const isValid3 = evaluate(ast3, ctx);
console.log(`\nRule: ${rule3}`);
console.log(`Valid: ${isValid3}`); // true

// Validation 4: Username length
const rule4 = "username.length >= 3";
const lengthSchema = { username: "string" } as const;
const [ast4] = parser.parse(rule4, lengthSchema);
const isValid4 = evaluate(ast4, { data: { username: formData.username }, nodes });
console.log(`\nRule: ${rule4}`);
console.log(`Valid: ${isValid4}`); // true

console.log("\n=== Validation System ===\n");

// Define validation rules with messages
interface ValidationRule {
  expression: string;
  message: string;
  schema: Record<string, string>;
  getValues: (data: typeof formData) => Record<string, unknown>;
}

const validationRules: ValidationRule[] = [
  {
    expression: "password == confirmPassword",
    message: "Passwords must match",
    schema: { password: "string", confirmPassword: "string" },
    getValues: (d) => ({ password: d.password, confirmPassword: d.confirmPassword }),
  },
  {
    expression: "age >= 18",
    message: "You must be at least 18 years old",
    schema: { age: "number" },
    getValues: (d) => ({ age: d.age }),
  },
  {
    expression: 'email contains "@"',
    message: "Email must contain @",
    schema: { email: "string" },
    getValues: (d) => ({ email: d.email }),
  },
];

// Validate form
function validateForm(data: typeof formData): string[] {
  const errors: string[] = [];

  for (const rule of validationRules) {
    const [ast] = parser.parse(rule.expression as never, rule.schema as never);
    const isValid = evaluate(ast, {
      data: rule.getValues(data),
      nodes,
    });

    if (!isValid) {
      errors.push(rule.message);
    }
  }

  return errors;
}

// Test with valid data
console.log("Valid form data:");
console.log(formData);
let errors = validateForm(formData);
console.log("Errors:", errors.length === 0 ? "None" : errors.join(", "));

// Test with invalid data
console.log("\nInvalid form data:");
const invalidFormData = {
  password: "secret123",
  confirmPassword: "different",
  email: "invalid-email",
  age: 16,
  username: "jo",
};
console.log(invalidFormData);
errors = validateForm(invalidFormData);
console.log("Errors:", errors.join("; "));
// Output: Passwords must match; You must be at least 18 years old; Email must contain @
