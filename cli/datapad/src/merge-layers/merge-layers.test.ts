import { describe, expect, it } from "vitest";

import { mergeLayers } from "./merge-layers.js";

describe("mergeLayers", () => {
	it("returns undefined when there is no layer", () => {
		expect(mergeLayers([])).toBeUndefined();
		expect(mergeLayers([undefined, undefined])).toBeUndefined();
	});

	it("merges later layers over earlier ones: scalars override, arrays concatenate, objects merge", () => {
		expect(
			mergeLayers<Record<string, unknown>>([
				{ a: 1, list: ["x"], nested: { p: 1, q: 1 } },
				undefined,
				{ a: 2, list: ["y"], nested: { q: 2 } },
			])
		).toEqual({ a: 2, list: ["x", "y"], nested: { p: 1, q: 2 } });
	});

	it("returns a copy, never one of the layers", () => {
		const only = { a: 1 };
		const merged = mergeLayers([only]);
		expect(merged).toEqual({ a: 1 });
		expect(merged).not.toBe(only);
	});
});
