import { describe, expect, test } from "vitest";

import { add } from "./add.js";

describe("add", () => {
	test("returns the correct sum", () => {
		expect(add(2, 3)).toBe(5);
	});

	test("handles negative numbers", () => {
		expect(add(-2, -3)).toBe(-5);
	});

	test("handles zero", () => {
		expect(add(0, 5)).toBe(5);
	});
});
