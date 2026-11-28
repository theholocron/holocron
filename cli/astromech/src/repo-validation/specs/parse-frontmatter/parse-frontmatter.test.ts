import { describe, expect, it } from "vitest";

import { parseFrontmatter } from "./parse-frontmatter.js";

/** Joins lines with a trailing newline, so a fixture is one source line per markdown line. */
const md = (...lines: string[]): string => `${lines.join("\n")}\n`;

describe("parseFrontmatter", () => {
	it("reads flat key: value fields with their 1-indexed line numbers", () => {
		const fm = parseFrontmatter(md("---", "status: draft", "issue: x#1", "---"));
		expect(fm?.get("status")).toEqual({ value: "draft", line: 2 });
		expect(fm?.get("issue")).toEqual({ value: "x#1", line: 3 });
	});

	it("reads one level of nesting as parent.child and skips anything else, keeping line numbers", () => {
		const fm = parseFrontmatter(md("---", "discussion:", "  github: x", "# comment", "status: draft", "---"));
		expect([...fm!.keys()]).toEqual(["discussion", "discussion.github", "status"]);
		expect(fm?.get("discussion")).toEqual({ value: "", line: 2 });
		expect(fm?.get("discussion.github")).toEqual({ value: "x", line: 3 });
		expect(fm?.get("status")).toEqual({ value: "draft", line: 5 });
	});

	it("ignores an indented line with no parent key before it", () => {
		expect([...parseFrontmatter(md("---", "  orphan: x", "status: draft", "---"))!.keys()]).toEqual(["status"]);
	});

	it("returns null when the text does not open with a frontmatter block", () => {
		expect(parseFrontmatter("# Just a heading\n")).toBeNull();
	});
});
