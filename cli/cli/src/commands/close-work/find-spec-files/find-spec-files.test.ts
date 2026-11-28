import { describe, expect, it } from "vitest";

import { findSpecFiles } from "./find-spec-files.js";

describe("findSpecFiles", () => {
	it("keeps the specs and ADRs, each once, sorted", () => {
		expect(
			findSpecFiles([
				"cli/cli/a.ts",
				".notes/tool-b.spec.md",
				"docs/wiki/decisions/adr-0001.md",
				".notes/tool-a.spec.md",
				".notes/tool-b.spec.md",
				"docs/readme.md",
			])
		).toEqual([".notes/tool-a.spec.md", ".notes/tool-b.spec.md", "docs/wiki/decisions/adr-0001.md"]);
	});

	it("is empty when the pull request holds no spec", () => {
		expect(findSpecFiles(["cli/cli/a.ts"])).toEqual([]);
	});
});
