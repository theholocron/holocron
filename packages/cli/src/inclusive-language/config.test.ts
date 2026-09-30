import { describe, expect, it } from "vitest";

import { ALEX_CONFIG, ALEX_IGNORE_PATTERNS } from "./config.js";

describe("ALEX_CONFIG", () => {
	it("is the real canonical allow-list, not a placeholder", () => {
		expect(ALEX_CONFIG.allow).toEqual(expect.arrayContaining(["hook", "husky"]));
		expect(Array.isArray(ALEX_CONFIG.allow)).toBe(true);
	});
});

describe("ALEX_IGNORE_PATTERNS", () => {
	it("parses the real .alexignore into a clean list, no blank lines", () => {
		expect(ALEX_IGNORE_PATTERNS).toContain("CHANGELOG.md");
		expect(ALEX_IGNORE_PATTERNS).toContain("LICENSE");
		expect(ALEX_IGNORE_PATTERNS.every((p) => p.length > 0)).toBe(true);
	});
});
