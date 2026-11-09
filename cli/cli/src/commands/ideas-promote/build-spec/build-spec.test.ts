import { describe, expect, it } from "vitest";

import { buildSpec } from "./build-spec.js";

const marked =
	"\n# Add a thing\n\nWe should add a thing.\n\nFiled from idea: Add a thing\n<!-- holocron:idea sub/idea.md -->";

describe("buildSpec", () => {
	it("writes draft frontmatter without an id, the title and a Problem section", () => {
		const { content, fromIdea } = buildSpec({ title: "Add a thing", body: marked, issue: "acme/demo#7" });
		expect(content).toBe(
			[
				"---",
				"status: draft",
				"issue: acme/demo#7",
				"blocked-by: []",
				"---",
				"",
				"# Add a thing",
				"",
				"## Problem",
				"",
				"We should add a thing.",
				"",
			].join("\n")
		);
		expect(content).not.toContain("id:");
		expect(fromIdea).toBe(true);
	});

	it("keeps an issue without the marker as it is and says so", () => {
		const { content, fromIdea } = buildSpec({
			title: "T",
			body: "Line one.\r\n\r\n\r\n\r\nLine two.   \r\n",
			issue: "RANDO-7",
		});
		expect(fromIdea).toBe(false);
		expect(content).toContain("issue: RANDO-7");
		expect(content).toContain("## Problem\n\nLine one.\n\nLine two.\n");
		expect(content).not.toContain("\r");
	});

	it("keeps a heading that is not the title", () => {
		const { content } = buildSpec({ title: "T", body: "# Other\n\ntext", issue: "x#1" });
		expect(content).toContain("# Other");
	});

	it("leaves the section empty when the issue has no text", () => {
		expect(buildSpec({ title: "T", body: undefined, issue: "x#1" }).content.endsWith("## Problem\n")).toBe(true);
		expect(
			buildSpec({ title: "T", body: "Filed from idea: T", issue: "x#1" }).content.endsWith("## Problem\n")
		).toBe(true);
	});
});
