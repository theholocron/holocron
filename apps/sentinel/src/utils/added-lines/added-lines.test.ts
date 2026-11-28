import { describe, expect, it } from "vitest";

import { addedLines } from "./added-lines.js";

describe("addedLines", () => {
	it("is undefined for a missing patch, which means not known", () => {
		expect(addedLines(undefined)).toBeUndefined();
		expect(addedLines("")).toBeUndefined();
	});

	it("numbers the added lines on the right side, skipping context and removed lines", () => {
		const patch = ["@@ -10,4 +10,5 @@", " keep", "-old", "+new one", "+new two", " keep", " keep"].join("\n");
		expect([...addedLines(patch)!]).toEqual([11, 12]);
	});

	it("follows each hunk's own start", () => {
		const patch = ["@@ -1,2 +1,2 @@", " a", "+b", "@@ -50,1 +51,2 @@", " c", "+d"].join("\n");
		expect([...addedLines(patch)!]).toEqual([2, 52]);
	});

	it("is an empty set for a patch that only removes lines", () => {
		expect(addedLines(["@@ -1,2 +1,1 @@", " a", "-b"].join("\n"))!.size).toBe(0);
	});

	it("ignores the no-newline marker and anything before the first hunk", () => {
		const patch = [
			"diff header",
			"@@ -1,1 +1,1 @@",
			"-a",
			"\\ No newline at end of file",
			"+b",
			"\\ No newline at end of file",
		].join("\n");
		expect([...addedLines(patch)!]).toEqual([1]);
	});
});
