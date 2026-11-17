import { describe, expect, it } from "vitest";

import { comparableDocs, normalizeDocs, readDocs, withDocs } from "./workspace-docs.js";

const FILE = [
	"opencollection: 1.0.0",
	"info:",
	'  name: "W"',
	"",
	"specs:",
	"",
	"docs: |-",
	"  # Title",
	"",
	"  Body.",
	"",
].join("\n");

describe("normalizeDocs", () => {
	it("ignores line endings and trailing whitespace", () => {
		expect(normalizeDocs("a\r\nb\r\n\r\n")).toBe("a\nb");
	});
});

describe("comparableDocs", () => {
	it("gives a padded table and an unpadded one the same text", () => {
		const padded = "| Name  | Kind |\n| ----- | :--: |\n| a     | b    |";
		const raw = "| Name | Kind |\n| - | :-: |\n| a | b |";
		expect(comparableDocs(padded)).toBe(comparableDocs(raw));
		expect(comparableDocs(raw)).toBe("| Name | Kind |\n| --- | :---: |\n| a | b |");
	});

	it("keeps the alignment colons, so another alignment is another text", () => {
		expect(comparableDocs("| a |\n| :-- |")).not.toBe(comparableDocs("| a |\n| --: |"));
	});

	it("leaves every other line as it is, apart from the normalizing", () => {
		expect(comparableDocs("# Title\r\n\r\n  | not a table\r\n\r\n")).toBe("# Title\n\n  | not a table");
	});
});

describe("readDocs", () => {
	it("reads a `|-` block with a blank line inside", () => {
		expect(readDocs(FILE)).toBe("# Title\n\nBody.");
	});

	it("stops the block at the next top-level key", () => {
		expect(readDocs(`${FILE}other: 1\n`)).toBe("# Title\n\nBody.");
	});

	it("reads a `|` block, an empty value, and one-line values", () => {
		expect(readDocs("docs: |\n  a\n  b\n")).toBe("a\nb");
		expect(readDocs("docs: ''\n")).toBe("");
		expect(readDocs("docs:\n")).toBe("");
		expect(readDocs("docs: 'it''s'\n")).toBe("it's");
		expect(readDocs('docs: "a\\nb"\n')).toBe("a\nb");
		expect(readDocs("docs: plain\n")).toBe("plain");
	});

	it("keeps the indentation inside a block that starts indented", () => {
		expect(readDocs("docs: |2-\n    code\n  text\n")).toBe("  code\ntext");
	});

	it("is an empty text for a block with nothing in it", () => {
		expect(readDocs("a: 1\ndocs: |-\nb: 2\n")).toBe("");
	});

	it("is undefined when there is no `docs:` key", () => {
		expect(readDocs("info:\n  name: x\n")).toBeUndefined();
	});

	it("refuses a folded block", () => {
		expect(() => readDocs("docs: >\n  a\n")).toThrow(/folded/);
	});
});

describe("withDocs", () => {
	it("replaces only the docs value and keeps every other byte", () => {
		const out = withDocs(`${FILE}activeEnvironmentUid: abc\n`, "# New\n\ntext");
		expect(out).toBe(
			[
				"opencollection: 1.0.0",
				"info:",
				'  name: "W"',
				"",
				"specs:",
				"",
				"docs: |-",
				"  # New",
				"",
				"  text",
				"activeEnvironmentUid: abc",
				"",
			].join("\n")
		);
	});

	it("round-trips through readDocs", () => {
		expect(readDocs(withDocs(FILE, "a\n\n  indented\nb"))).toBe("a\n\n  indented\nb");
		expect(readDocs(withDocs(FILE, "  starts indented"))).toBe("  starts indented");
	});

	it("adds the key after a blank line when the file has none", () => {
		expect(withDocs("info:\n  name: x\n", "hi")).toBe("info:\n  name: x\n\ndocs: |-\n  hi\n");
	});

	it("adds the key to an empty file, to one with no final newline and to one that already ends in a blank line", () => {
		expect(withDocs("", "hi")).toBe("docs: |-\n  hi\n");
		expect(withDocs("a: 1", "hi")).toBe("a: 1\n\ndocs: |-\n  hi\n");
		expect(withDocs("a: 1\n\n", "hi")).toBe("a: 1\n\ndocs: |-\n  hi\n");
	});

	it("replaces `docs: ''`, and writes an empty text as `docs: ''`", () => {
		expect(withDocs("a: 1\ndocs: ''\nb: 2\n", "hi")).toBe("a: 1\ndocs: |-\n  hi\nb: 2\n");
		expect(withDocs(FILE, "")).toContain("docs: ''");
	});
});
