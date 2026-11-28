import { describe, expect, it } from "vitest";

import { stripControl } from "./strip-control.js";

describe("stripControl", () => {
	it("turns control characters, newlines and the C1 range into single spaces, with no length cap", () => {
		expect(stripControl("a\u001b[2Jb\u009bc\nd\te")).toBe("a [2Jb c d e");
		expect(stripControl("x".repeat(500))).toHaveLength(500);
	});

	it("trims what is left", () => {
		expect(stripControl("\n  text \t")).toBe("text");
	});
});
