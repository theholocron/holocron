import { describe, expect, it } from "vitest";

import { writeProperty } from "./write-property.js";

describe("writeProperty", () => {
	it("adds issue: at the end of the block and leaves the rest byte for byte", () => {
		const text = "---\nstatus: in-progress\ntags: [a,  b]\n---\n\n# T\n\ttabbed  \n\n";
		expect(writeProperty(text, "issue", "#7")).toBe(
			"---\nstatus: in-progress\ntags: [a,  b]\nissue: #7\n---\n\n# T\n\ttabbed  \n\n"
		);
	});

	it("fills in a blank issue: line in place", () => {
		expect(writeProperty("---\nissue:\nstatus: x\n---\nbody", "issue", "ENG-42")).toBe(
			"---\nissue: ENG-42\nstatus: x\n---\nbody"
		);
	});

	it("keeps CRLF line endings, on the new line too", () => {
		expect(writeProperty("---\r\nstatus: x\r\n---\r\nbody\r\n", "issue", "#1")).toBe(
			"---\r\nstatus: x\r\nissue: #1\r\n---\r\nbody\r\n"
		);
		expect(writeProperty("---\r\nissue: \r\nstatus: x\r\n---\r\nb", "issue", "#1")).toBe(
			"---\r\nissue: #1\r\nstatus: x\r\n---\r\nb"
		);
	});

	it("returns a note without frontmatter unchanged", () => {
		expect(writeProperty("# T\n", "issue", "#1")).toBe("# T\n");
		expect(writeProperty("---\n---\n", "issue", "#1")).toBe("---\n---\n");
	});

	it("replaces status: in place, and adds it when the note has none", () => {
		expect(writeProperty("---\r\nstatus: seed\r\ntags: [a]\r\n---\r\nb\r\n", "status", "in-progress")).toBe(
			"---\r\nstatus: in-progress\r\ntags: [a]\r\n---\r\nb\r\n"
		);
		expect(writeProperty("---\ntags: [a]\n---\nb", "status", "seed")).toBe("---\ntags: [a]\nstatus: seed\n---\nb");
	});

	it("does not touch an issue-like line in the body", () => {
		const text = "---\nstatus: x\n---\nissue: not a property\n";
		expect(writeProperty(text, "issue", "#2")).toBe("---\nstatus: x\nissue: #2\n---\nissue: not a property\n");
	});
});
