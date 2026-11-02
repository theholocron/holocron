import { describe, expect, it } from "vitest";

import { parseFrontmatter } from "../parse-frontmatter/index.js";
import { updateFrontmatter } from "./update-frontmatter.js";

const doc = (...front: string[]): string =>
	`---\n${front.join("\n")}\n---\n\n# Title\n\nBody with a --- rule\n---\nand more.\n`;

describe("updateFrontmatter", () => {
	it("replaces the status line and leaves everything else as it was", () => {
		const text = doc("status: proposed", "issue: x#1", "related:", "  - x#2");

		expect(updateFrontmatter(text, { status: "accepted" })).toBe(
			doc("status: accepted", "issue: x#1", "related:", "  - x#2")
		);
	});

	it("adds a status line when there is none", () => {
		expect(updateFrontmatter(doc("issue: x#1"), { status: "draft" })).toBe(doc("issue: x#1", "status: draft"));
	});

	it("adds a discussion block with the address when the document has none", () => {
		const result = updateFrontmatter(doc("status: draft"), { discussionUrl: "https://discord.com/channels/1/2" });

		expect(result).toBe(doc("status: draft", "discussion:", "  url: https://discord.com/channels/1/2"));
		expect(parseFrontmatter(result)?.get("discussion.url")?.value).toBe("https://discord.com/channels/1/2");
	});

	it("adds the address under an existing discussion block, keeping the github link beside it", () => {
		const text = doc(
			"status: accepted",
			"discussion:",
			"  github: https://github.com/o/r/pull/1",
			"date: 2026-01-01"
		);

		expect(updateFrontmatter(text, { discussionUrl: "https://d/1" })).toBe(
			doc(
				"status: accepted",
				"discussion:",
				"  url: https://d/1",
				"  github: https://github.com/o/r/pull/1",
				"date: 2026-01-01"
			)
		);
	});

	it("replaces an address that is already there", () => {
		const text = doc("discussion:", "  github: https://g/1", "  url: https://old", "status: draft");

		expect(updateFrontmatter(text, { discussionUrl: "https://new" })).toBe(
			doc("discussion:", "  github: https://g/1", "  url: https://new", "status: draft")
		);
	});

	it("turns a plain discussion value into a block that keeps it as the github link", () => {
		const result = updateFrontmatter(doc("discussion: https://github.com/o/r/discussions/9", "status: draft"), {
			discussionUrl: "https://d/1",
		});

		expect(result).toBe(
			doc("discussion:", "  github: https://github.com/o/r/discussions/9", "  url: https://d/1", "status: draft")
		);
	});

	it("sets both fields at once", () => {
		expect(updateFrontmatter(doc("status: draft"), { status: "proposed", discussionUrl: "https://d/1" })).toBe(
			doc("status: proposed", "discussion:", "  url: https://d/1")
		);
	});

	it("sets the id: replaces one, or adds it as the first field", () => {
		expect(updateFrontmatter(doc("id: SPEC-0001", "status: draft"), { id: "SPEC-0002" })).toBe(
			doc("id: SPEC-0002", "status: draft")
		);
		expect(updateFrontmatter(doc("status: draft", "issue: x#1"), { id: "SPEC-0007" })).toBe(
			doc("id: SPEC-0007", "status: draft", "issue: x#1")
		);
	});

	it("returns the text as it is when nothing is asked for, or the document has no front matter", () => {
		const text = doc("status: draft");

		expect(updateFrontmatter(text, {})).toBe(text);
		expect(updateFrontmatter("# No front matter\n", { status: "draft" })).toBe("# No front matter\n");
	});

	it("finds a status that sits between other fields without touching a longer key that starts the same", () => {
		const text = doc("statuses: [a]", "status: draft", "z: 1");

		expect(updateFrontmatter(text, { status: "accepted" })).toBe(doc("statuses: [a]", "status: accepted", "z: 1"));
	});
});
