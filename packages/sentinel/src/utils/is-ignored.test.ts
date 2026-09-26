import { describe, expect, it } from "vitest";

import { isIgnored } from "./is-ignored.js";

describe("isIgnored", () => {
	it("matches an exact path", () => {
		expect(isIgnored("CHANGELOG.md", ["CHANGELOG.md"])).toBe(true);
		expect(isIgnored("docs/CHANGELOG.md", ["CHANGELOG.md"])).toBe(false);
	});

	it("matches a dir/* prefix pattern", () => {
		expect(isIgnored(".github/foo.yml", [".github/*"])).toBe(true);
		expect(isIgnored(".github-extra/foo.yml", [".github/*"])).toBe(false);
	});

	it("returns false when nothing matches", () => {
		expect(isIgnored("src/index.ts", ["CHANGELOG.md", ".github/*"])).toBe(false);
	});
});
