import { describe, expect, it } from "vitest";

import { diffNames } from "./diff-names.js";

describe("diffNames", () => {
	it("lists what is missing and what is extra, sorted", () => {
		expect(diffNames(["b", "a", "c"], ["z", "c", "y"])).toEqual({
			expected: ["a", "b", "c"],
			missing: ["a", "b"],
			extra: ["y", "z"],
		});
	});

	it("finds no difference for the same names and ignores duplicates", () => {
		expect(diffNames(["a", "a"], ["a", "a"])).toEqual({ expected: ["a"], missing: [], extra: [] });
	});
});
