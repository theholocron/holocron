import { describe, expect, it } from "vitest";

import { ALEX_CONFIG, ALEX_IGNORE_PATTERNS, ALEX_SEVERITY_OVERRIDES } from "./config.js";

describe("ALEX_CONFIG", () => {
	it("is the real canonical allow-list, not a placeholder", () => {
		expect(ALEX_CONFIG.allow).toEqual(expect.arrayContaining(["hook", "husky"]));
		expect(Array.isArray(ALEX_CONFIG.allow)).toBe(true);
	});
});

describe("ALEX_SEVERITY_OVERRIDES", () => {
	it("marks just as warning -- the org explicitly decided not to allow-list it instead (holocron#865)", () => {
		expect(ALEX_SEVERITY_OVERRIDES["just"]).toBe("warning");
	});

	it("doesn't list a word that's already allow-listed -- the two mechanisms are mutually exclusive by construction", () => {
		for (const word of Object.keys(ALEX_SEVERITY_OVERRIDES)) {
			expect(ALEX_CONFIG.allow).not.toContain(word);
		}
	});
});

describe("ALEX_IGNORE_PATTERNS", () => {
	it("parses the real .alexignore into a clean list, no blank lines", () => {
		expect(ALEX_IGNORE_PATTERNS).toContain("CHANGELOG.md");
		expect(ALEX_IGNORE_PATTERNS).toContain("LICENSE");
		expect(ALEX_IGNORE_PATTERNS.every((p) => p.length > 0)).toBe(true);
	});
});
