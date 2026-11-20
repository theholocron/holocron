import { describe, expect, it } from "vitest";

import { pathMatches } from "./path-matches.js";

describe("pathMatches", () => {
	it("matches ** across folders and * within one", () => {
		expect(pathMatches("cli/cli/src/a.ts", "cli/**")).toBe(true);
		expect(pathMatches("clients/x.ts", "cli/**")).toBe(false);
		expect(pathMatches("docs/a/b/c.md", "docs/**/*.md")).toBe(true);
		expect(pathMatches("docs/c.md", "docs/**/*.md")).toBe(true);
		expect(pathMatches("docs/a/c.txt", "docs/**/*.md")).toBe(false);
		expect(pathMatches("a/b.ts", "a/*.ts")).toBe(true);
		expect(pathMatches("a/b/c.ts", "a/*.ts")).toBe(false);
		expect(pathMatches("a/b.ts", "a/?.ts")).toBe(true);
		expect(pathMatches("a/b.ts", "a/**.ts")).toBe(true);
	});

	it("takes a plain pattern as a file or a folder", () => {
		expect(pathMatches("turbo.json", "turbo.json")).toBe(true);
		expect(pathMatches("turbo.json.bak", "turbo.json")).toBe(false);
		expect(pathMatches(".holocron/repo.ts", ".holocron")).toBe(true);
		expect(pathMatches(".holocron/repo.ts", "./.holocron/")).toBe(true);
		expect(pathMatches("x.holocron/a", ".holocron")).toBe(false);
	});

	it("escapes the characters a path may hold", () => {
		expect(pathMatches("a+b/(c).ts", "a+b/**")).toBe(true);
		expect(pathMatches("axb/c", "a+b/**")).toBe(false);
	});
});
