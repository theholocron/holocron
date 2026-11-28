import { describe, expect, it } from "vitest";

import { readWorkspaceGlobs, readWorkspacePatterns } from "./workspace-globs.ts";

describe("readWorkspaceGlobs", () => {
	it("reads the plain block list, stripping quotes and trailing comments", () => {
		const yaml = [
			"packages:",
			'  - "docs"',
			"  - 'apps/*'",
			"  - packages/* # the core",
			"",
			"catalog:",
			"  a: ^1",
		].join("\n");
		expect(readWorkspaceGlobs(yaml)).toEqual({ include: ["docs", "apps/*", "packages/*"], exclude: [] });
	});

	it("separates `!` exclusions and normalizes ./ and trailing slashes", () => {
		const yaml = "packages:\n  - ./clients/\n  - '!clients/legacy'\n  - observability\n";
		expect(readWorkspaceGlobs(yaml)).toEqual({
			include: ["clients", "observability"],
			exclude: ["clients/legacy"],
		});
	});

	it("skips blank lines and comments inside the list, and stops at the next key", () => {
		const yaml = "packages:\n  # shared\n  - a\n\n  - b\noverrides:\n  - c\n";
		expect(readWorkspaceGlobs(yaml).include).toEqual(["a", "b"]);
	});

	it("ignores an empty entry", () => {
		expect(readWorkspaceGlobs("packages:\n  - ''\n  - a\n  -   # nothing\n").include).toEqual(["a"]);
	});

	it("reads nothing when `packages:` is absent or inline", () => {
		expect(readWorkspaceGlobs("catalog:\n  a: ^1\n")).toEqual({ include: [], exclude: [] });
		expect(readWorkspaceGlobs("packages: [a, b]\n")).toEqual({ include: [], exclude: [] });
	});
});

describe("readWorkspaceGlobs comments", () => {
	it("strips a comment after whitespace, keeps a # inside a word, and reads a line that is only a comment mark", () => {
		expect(
			readWorkspaceGlobs(["packages:", "  - a/* # why", "  - b#c/*", "  - #only", "  - d/*"].join("\n")).include
		).toEqual(["a/*", "b#c/*", "d/*"]);
	});

	it("reads a very long indented item without backtracking", () => {
		const started = Date.now();
		readWorkspaceGlobs(["packages:", `${" ".repeat(100_000)}- ${" ".repeat(100_000)}x`].join("\n"));
		expect(Date.now() - started).toBeLessThan(1000);
	});
});

describe("readWorkspacePatterns", () => {
	it("keeps file order, with a `!` on each negation, so inclusions and exclusions interleave", () => {
		const yaml = "packages:\n  - 'a/*'\n  - '!./a/x/'\n  - b/**\n";
		expect(readWorkspacePatterns(yaml)).toEqual(["a/*", "!a/x", "b/**"]);
	});

	it("reads nothing when `packages:` is absent", () => {
		expect(readWorkspacePatterns("catalog:\n  a: ^1\n")).toEqual([]);
	});
});
