import { describe, expect, it } from "vitest";

import { readWorkspaceGlobs } from "./workspace-globs.js";

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

	it("reads nothing when `packages:` is absent or inline", () => {
		expect(readWorkspaceGlobs("catalog:\n  a: ^1\n")).toEqual({ include: [], exclude: [] });
		expect(readWorkspaceGlobs("packages: [a, b]\n")).toEqual({ include: [], exclude: [] });
	});
});
