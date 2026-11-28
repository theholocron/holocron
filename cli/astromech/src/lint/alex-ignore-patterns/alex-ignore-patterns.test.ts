import { describe, expect, it } from "vitest";

import { ALEX_IGNORE_PATTERNS } from "./alex-ignore-patterns.js";

describe("ALEX_IGNORE_PATTERNS", () => {
	it("is a clean list with no blank entries, and skips the changelog and the license", () => {
		expect(ALEX_IGNORE_PATTERNS).toContain("CHANGELOG.md");
		expect(ALEX_IGNORE_PATTERNS).toContain("LICENSE");
		expect(ALEX_IGNORE_PATTERNS.every((p) => p.length > 0)).toBe(true);
	});
});
