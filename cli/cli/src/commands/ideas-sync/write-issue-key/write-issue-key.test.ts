import { describe, expect, it } from "vitest";

import { writeIssueKey } from "./write-issue-key.js";

describe("writeIssueKey", () => {
	it("adds issue: at the end of the block and leaves the rest byte for byte", () => {
		const text = "---\nstatus: in-progress\ntags: [a,  b]\n---\n\n# T\n\ttabbed  \n\n";
		expect(writeIssueKey(text, "#7")).toBe(
			"---\nstatus: in-progress\ntags: [a,  b]\nissue: #7\n---\n\n# T\n\ttabbed  \n\n"
		);
	});

	it("fills in a blank issue: line in place", () => {
		expect(writeIssueKey("---\nissue:\nstatus: x\n---\nbody", "ENG-42")).toBe(
			"---\nissue: ENG-42\nstatus: x\n---\nbody"
		);
	});

	it("keeps CRLF line endings, on the new line too", () => {
		expect(writeIssueKey("---\r\nstatus: x\r\n---\r\nbody\r\n", "#1")).toBe(
			"---\r\nstatus: x\r\nissue: #1\r\n---\r\nbody\r\n"
		);
		expect(writeIssueKey("---\r\nissue: \r\nstatus: x\r\n---\r\nb", "#1")).toBe(
			"---\r\nissue: #1\r\nstatus: x\r\n---\r\nb"
		);
	});

	it("returns a note without frontmatter unchanged", () => {
		expect(writeIssueKey("# T\n", "#1")).toBe("# T\n");
		expect(writeIssueKey("---\n---\n", "#1")).toBe("---\n---\n");
	});

	it("does not touch an issue-like line in the body", () => {
		const text = "---\nstatus: x\n---\nissue: not a property\n";
		expect(writeIssueKey(text, "#2")).toBe("---\nstatus: x\nissue: #2\n---\nissue: not a property\n");
	});
});
