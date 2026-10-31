/**
 * Check that a value is present and, when it is an array, not empty.
 *
 * Only `null`, `undefined` and empty arrays are rejected. Every other value counts as valid, including
 * non-array values such as numbers, strings, objects and booleans (`false` and `0` included).
 *
 * @remarks
 * Despite the package name, the check is not limited to arrays: it is a guard for "something worth
 * working with", so a value can be passed through it before being iterated or spread.
 *
 * @param item - The value to check.
 * @returns `false` when `item` is `null`, `undefined` or an empty array, otherwise `true`.
 *
 * @example
 * ```ts
 * import { isValid } from "@theholocron/array-utils";
 *
 * isValid([1, 2, 3]); // true
 * isValid([]); // false
 * isValid(null); // false
 * isValid(undefined); // false
 * isValid("hello"); // true
 * isValid(0); // true
 * ```
 *
 * @see {@link https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Array/isArray | Array.isArray}
 */
export const isValid = (item: unknown): boolean =>
	item !== null && item !== undefined && !(Array.isArray(item) && item.length === 0);
