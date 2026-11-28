import { describe, expect, it } from "vitest";

import { shallowMerge } from "./shallow-merge.js";

describe("shallowMerge", () => {
	it("starts empty and overrides per top-level key", () => {
		const s = shallowMerge<Record<string, unknown>>();
		expect(s.empty).toEqual({});
		expect(s.merge({ a: 1, b: { x: 1 } }, { b: { y: 2 }, c: 3 })).toEqual({ a: 1, b: { y: 2 }, c: 3 });
	});
});
