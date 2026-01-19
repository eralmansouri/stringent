/**
 * Test helpers/utilities for Stringent library tests.
 *
 * Provides type-level assertion helpers and common test fixtures.
 */

/**
 * Type-level assertion: Asserts two types are exactly equal.
 * If T and Expected are not equal, this type is `false`.
 */
export type AssertEqual<T, Expected> = T extends Expected
  ? Expected extends T
    ? true
    : false
  : false;

/**
 * Type-level assertion: Asserts T extends Base.
 */
export type AssertExtends<T, Base> = T extends Base ? true : false;

/**
 * Helper to verify type assertions at compile time.
 * Usage: const _check: TypeEquals<T, Expected> = true;
 * If the types don't match, TypeScript will error.
 */
export function typeCheck<T extends true>(_: T): void {}
