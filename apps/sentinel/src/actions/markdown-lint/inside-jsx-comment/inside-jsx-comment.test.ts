import { describe, expect, it } from "vitest";

import { insideJsxComment } from "./inside-jsx-comment.js";

describe("insideJsxComment", () => {
	const line = "A cell {/* note */} and * real * text";
	//            col:    8          19    24

	it("is true for a span wholly inside a comment on one line", () => {
		expect(insideJsxComment(line, 1, 11, 4)).toBe(true);
	});

	it("is false for a span outside any comment", () => {
		expect(insideJsxComment(line, 1, 25, 8)).toBe(false);
	});

	it("is false for a span that starts inside a comment and runs out of it", () => {
		expect(insideJsxComment(line, 1, 11, 30)).toBe(false);
	});

	it("reads a comment that runs over several lines", () => {
		const content = "intro\n{/* one\n * two *\n three */}\n* real *\n";
		expect(insideJsxComment(content, 3, 2, 7)).toBe(true);
		expect(insideJsxComment(content, 5, 1, 8)).toBe(false);
	});

	it("counts only the lines before the finding, so a comment on an earlier line does not cover a later one", () => {
		const content = "{/* a */}\nplain * text *\n";
		expect(insideJsxComment(content, 2, 7, 8)).toBe(false);
	});

	it("is false for a line past the end of the content", () => {
		expect(insideJsxComment("{/* x */}\n", 3, 1)).toBe(false);
		expect(insideJsxComment("{/* x */}", 2, 1)).toBe(false);
	});

	it("is false when there is no comment at all", () => {
		expect(insideJsxComment("plain * text *", 1, 7, 8)).toBe(false);
	});

	it("takes a missing length as one character", () => {
		expect(insideJsxComment("{/* x */}", 1, 4)).toBe(true);
		expect(insideJsxComment("{/* x */} y", 1, 11)).toBe(false);
	});
});
