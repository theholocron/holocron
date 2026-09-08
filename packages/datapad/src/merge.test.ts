import { describe, expect, it } from "vitest";

import { mergeConfig } from "./merge.js";

describe("mergeConfig", () => {
	it("recursively merges plain objects", () => {
		expect(mergeConfig({ a: 1, nested: { x: 1, y: 2 } }, { b: 2, nested: { y: 9, z: 3 } })).toEqual({
			a: 1,
			b: 2,
			nested: { x: 1, y: 9, z: 3 },
		});
	});

	it("concatenates arrays base-first", () => {
		expect(mergeConfig({ tasks: ["a", "b"] }, { tasks: ["c"] })).toEqual({ tasks: ["a", "b", "c"] });
	});

	it("skips undefined values in the override", () => {
		expect(mergeConfig({ a: 1, b: 2 }, { a: undefined, b: 5 })).toEqual({ a: 1, b: 5 });
	});

	it("replaces scalars and mismatched types", () => {
		expect(mergeConfig({ a: 1, b: { x: 1 } }, { a: "two", b: [1] })).toEqual({ a: "two", b: [1] });
	});

	it("returns the override when it is not a plain object", () => {
		expect(mergeConfig({ a: 1 }, ["x"])).toEqual(["x"]);
		expect(mergeConfig({ a: 1 }, 5)).toBe(5);
	});

	it("returns the base when the override is undefined", () => {
		expect(mergeConfig({ a: 1 }, undefined)).toEqual({ a: 1 });
		expect(mergeConfig(undefined, { a: 1 })).toEqual({ a: 1 });
	});

	it("treats a null-prototype object as plain", () => {
		const override = Object.assign(Object.create(null) as Record<string, unknown>, { b: 2 });
		expect(mergeConfig({ a: 1 }, override)).toEqual({ a: 1, b: 2 });
	});

	it("does not mutate either input", () => {
		const base = { nested: { a: 1 }, list: [1] };
		const override = { nested: { b: 2 }, list: [2] };
		mergeConfig(base, override);
		expect(base).toEqual({ nested: { a: 1 }, list: [1] });
		expect(override).toEqual({ nested: { b: 2 }, list: [2] });
	});
});
