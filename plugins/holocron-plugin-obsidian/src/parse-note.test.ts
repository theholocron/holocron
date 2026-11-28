import { describe, expect, it } from "vitest";

import { parseNote } from "./parse-note.js";

describe("parseNote", () => {
	it("reads status, issue, the first heading and the body without frontmatter", () => {
		const note = parseNote("---\nstatus: in-progress\nissue: #12\n---\n\n# Big idea\n\nText\n", "big.md");
		expect(note).toMatchObject({ status: "in-progress", issue: "#12", title: "Big idea" });
		expect(note.body).toBe("\n# Big idea\n\nText\n");
		expect(note.attachments).toEqual([]);
	});

	it("takes the first heading of level one only, and keeps a # inside it", () => {
		expect(parseNote("---\nstatus: x\n---\n## Not this\n# Learn C#\n# Second\n", "n.md").title).toBe("Learn C#");
	});

	it("falls back to the file name without .md", () => {
		expect(parseNote("---\nstatus: x\n---\nno heading\n", "my idea.md").title).toBe("my idea");
		expect(parseNote("no frontmatter", "plain.MD").title).toBe("plain");
	});

	it("has empty status and issue with no frontmatter or a blank issue", () => {
		expect(parseNote("# T\n", "t.md")).toMatchObject({ status: "", issue: "", body: "# T\n" });
		expect(parseNote("---\nstatus: seed\nissue:\n---\nx", "t.md").issue).toBe("");
	});

	it("removes quotes around property values", () => {
		const note = parseNote("---\nstatus: \"in-progress\"\nissue: 'ENG-4'\n---\nx", "t.md");
		expect(note).toMatchObject({ status: "in-progress", issue: "ENG-4" });
	});

	it("reads CRLF notes", () => {
		const note = parseNote("---\r\nstatus: seed\r\n---\r\n# Win\r\nx\r\n", "w.md");
		expect(note).toMatchObject({ status: "seed", title: "Win", body: "# Win\r\nx\r\n" });
	});

	it("finds wiki embeds and local image links, but not web images or plain links", () => {
		const text =
			"---\nstatus: x\n---\n![[pic.png]]\n![alt](assets/a.png)\n![remote](https://x.dev/a.png)\n[link](b.png)\n";
		expect(parseNote(text, "t.md").attachments).toEqual(["![[pic.png]]", "![alt](assets/a.png)"]);
	});

	it("ignores an embed inside a code fence", () => {
		const text = "---\nstatus: x\n---\n```md\n![[pic.png]]\n```\n";
		expect(parseNote(text, "t.md").attachments).toEqual([]);
	});
});
