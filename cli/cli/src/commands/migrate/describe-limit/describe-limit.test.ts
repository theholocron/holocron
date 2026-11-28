import { describe, expect, it } from "vitest";

import { describeLimit } from "./describe-limit.js";

describe("describeLimit", () => {
	it("says how many were read of how many matched, and which end", () => {
		expect(describeLimit(2, 7, "newest")).toBe("limited to 2 of 7 (newest created)");
	});

	it("defaults to the oldest end and leaves out an unknown total", () => {
		expect(describeLimit(3, undefined)).toBe("limited to 3 (oldest created)");
	});
});
