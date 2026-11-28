import { describe, expect, it } from "vitest";

import { sanitizeDetail } from "./sanitize-detail.js";

describe("sanitizeDetail", () => {
	it("flattens whitespace and strips control characters, including the C1 range", () => {
		expect(sanitizeDetail("a\n\tb\u001b[2J\u009bc")).toBe("a b [2J c");
	});

	it("caps the length with an ellipsis", () => {
		const out = sanitizeDetail("x".repeat(500));
		expect(out).toHaveLength(201);
		expect(out.endsWith("…")).toBe(true);
	});

	it("leaves a short text as it is", () => {
		expect(sanitizeDetail("short")).toBe("short");
	});
});
