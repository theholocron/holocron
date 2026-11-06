import { describe, expect, it } from "vitest";

import { union } from "./union.js";

describe("union", () => {
	it("starts empty and dedupes in first-seen order", () => {
		const s = union<string>();
		expect(s.empty).toEqual([]);
		expect(s.merge(["a", "b"], ["b", "c"])).toEqual(["a", "b", "c"]);
	});
});
