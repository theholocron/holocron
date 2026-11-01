import { describe, expect, it } from "vitest";

import { specTitle } from "./spec-title.js";

describe("specTitle", () => {
	it("takes the first heading after the frontmatter", () => {
		const text = "---\nstatus: proposed\n---\n\n# Discord: channel content\n\n## Problem\n";

		expect(specTitle(".notes/tech-discord.spec.md", text)).toBe("Discord: channel content");
	});

	it("takes the first heading of a file with no frontmatter, and trims closing hashes", () => {
		expect(specTitle(".notes/x.spec.md", "intro\n# Title here ##  \n")).toBe("Title here");
	});

	it("does not read a heading-like line inside the frontmatter", () => {
		expect(specTitle(".notes/tech-x.spec.md", "---\n# not a title\n---\nno heading\n")).toBe("tech-x");
	});

	it("falls back to the file name, in a folder or not", () => {
		expect(specTitle(".notes/tech-doctor.spec.md", "no heading")).toBe("tech-doctor");
		expect(specTitle("loose.spec.md", "no heading")).toBe("loose");
	});

	it("falls back to the file name when the heading is only characters that are removed", () => {
		expect(specTitle(".notes/tech-x.spec.md", "# **__**\n")).toBe("tech-x");
	});

	it("removes what would format, link or ping, and collapses whitespace", () => {
		const title = specTitle(
			".notes/x.spec.md",
			"# [Click](https://evil.example)  <@&1> `code` *bold*   _it_ |x|\\\n"
		);

		expect(title).toBe("Clickhttps://evil.example @&1 code bold it x");
	});

	it("caps a long title with an ellipsis", () => {
		const title = specTitle(".notes/x.spec.md", `# ${"word ".repeat(40)}\n`);

		expect(title).toHaveLength(100);
		expect(title.endsWith("…")).toBe(true);
	});

	it("keeps a title of exactly the cap", () => {
		const exact = "a".repeat(100);

		expect(specTitle(".notes/x.spec.md", `# ${exact}\n`)).toBe(exact);
	});
});
