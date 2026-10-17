import { describe, expect, it } from "vitest";

import { ALEX_IGNORE_PATTERNS } from "./alex-ignore-patterns.js";

describe("ALEX_IGNORE_PATTERNS", () => {
	it("parses the real .alexignore into a clean list, no blank lines", () => {
		expect(ALEX_IGNORE_PATTERNS).toContain("CHANGELOG.md");
		expect(ALEX_IGNORE_PATTERNS).toContain("LICENSE");
		expect(ALEX_IGNORE_PATTERNS.every((p) => p.length > 0)).toBe(true);
	});
});
