import { describe, expect, it } from "vitest";

import { pathMatches } from "./path-matches.js";

describe("pathMatches, a folder pattern with a run of trailing slashes", () => {
	it("takes every trailing slash off the folder, and keeps a sibling that shares its prefix out", () => {
		expect(pathMatches("docs/a.md", "docs///")).toBe(true);
		expect(pathMatches("docs/a.md", "./docs/")).toBe(true);
		expect(pathMatches("docs-old/a.md", "docs//")).toBe(false);
		expect(pathMatches("docs", "docs/")).toBe(true);
	});

	it("reads a pattern that is only slashes as no folder, without scanning it twice", () => {
		const started = Date.now();
		expect(pathMatches("a/b.ts", "/".repeat(200_000))).toBe(false);
		expect(Date.now() - started).toBeLessThan(1000);
	});
});
