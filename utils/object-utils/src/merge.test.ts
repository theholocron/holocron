import { describe, expect, it } from "vitest";

import { deepMerge, isPlainObject } from "./merge.ts";

describe("deepMerge", () => {
	it("recursively merges plain objects", () => {
		expect(deepMerge({ a: 1, nested: { x: 1, y: 2 } }, { b: 2, nested: { y: 9, z: 3 } })).toEqual({
			a: 1,
			b: 2,
			nested: { x: 1, y: 9, z: 3 },
		});
	});

	it("concatenates arrays base-first", () => {
		expect(deepMerge({ tasks: ["a", "b"] }, { tasks: ["c"] })).toEqual({ tasks: ["a", "b", "c"] });
	});

	it("skips undefined values in the override", () => {
		expect(deepMerge({ a: 1, b: 2 }, { a: undefined, b: 5 })).toEqual({ a: 1, b: 5 });
	});

	it("replaces scalars and mismatched types", () => {
		expect(deepMerge({ a: 1, b: { x: 1 } }, { a: "two", b: [1] })).toEqual({ a: "two", b: [1] });
	});

	it("returns the override when it is not a plain object", () => {
		expect(deepMerge({ a: 1 }, ["x"])).toEqual(["x"]);
		expect(deepMerge({ a: 1 }, 5)).toBe(5);
	});

	it("returns the base when the override is undefined", () => {
		expect(deepMerge({ a: 1 }, undefined)).toEqual({ a: 1 });
		expect(deepMerge(undefined, { a: 1 })).toEqual({ a: 1 });
	});

	it("treats a null-prototype object as plain", () => {
		const override = Object.assign(Object.create(null) as Record<string, unknown>, { b: 2 });
		expect(deepMerge({ a: 1 }, override)).toEqual({ a: 1, b: 2 });
	});

	it("does not mutate either input", () => {
		const base = { nested: { a: 1 }, list: [1] };
		const override = { nested: { b: 2 }, list: [2] };
		deepMerge(base, override);
		expect(base).toEqual({ nested: { a: 1 }, list: [1] });
		expect(override).toEqual({ nested: { b: 2 }, list: [2] });
	});
});

describe("isPlainObject", () => {
	it("is true for an object literal", () => {
		expect(isPlainObject({ a: 1 })).toBe(true);
	});

	it("is true for a null-prototype object", () => {
		expect(isPlainObject(Object.create(null))).toBe(true);
	});

	it("is false for an array", () => {
		expect(isPlainObject([1, 2])).toBe(false);
	});

	it("is false for null", () => {
		expect(isPlainObject(null)).toBe(false);
	});

	it("is false for a class instance", () => {
		expect(isPlainObject(new Date())).toBe(false);
	});

	it("is false for primitives", () => {
		expect(isPlainObject(5)).toBe(false);
		expect(isPlainObject("x")).toBe(false);
		expect(isPlainObject(undefined)).toBe(false);
	});
});
