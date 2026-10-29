import { describe, expect, it } from "vitest";

import { addedLines } from "./added-lines.js";

describe("addedLines", () => {
	it("reads the new-file lines of every hunk, per file", () => {
		const diff = [
			"diff --git a/src/a.ts b/src/a.ts",
			"--- a/src/a.ts",
			"+++ b/src/a.ts",
			"@@ -3,0 +4,2 @@ export const x = 1;",
			"+a",
			"+b",
			"@@ -10 +12 @@",
			"-old",
			"+new",
			"@@ -20,3 +22,0 @@",
			"diff --git a/src/b.ts b/src/b.ts",
			"--- a/src/b.ts",
			"+++ b/src/b.ts",
			"@@ -1 +1,3 @@",
		].join("\n");
		const lines = addedLines(diff);
		expect([...lines.get("src/a.ts")!]).toEqual([4, 5, 12]);
		expect([...lines.get("src/b.ts")!]).toEqual([1, 2, 3]);
	});

	it("ignores a deleted file and hunks before any file header", () => {
		expect(addedLines(["@@ -1 +1 @@", "--- a/gone.ts", "+++ /dev/null", "@@ -1,2 +0,0 @@"].join("\n")).size).toBe(
			0
		);
		expect(addedLines("").size).toBe(0);
	});
});
