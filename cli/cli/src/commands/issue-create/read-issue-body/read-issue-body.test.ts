import { describe, expect, it } from "vitest";

import { readIssueBody } from "./read-issue-body.js";

describe("readIssueBody", () => {
	it("reads standard input for `-`", () => {
		expect(readIssueBody("-", "/repo", (p) => (p === 0 ? "from stdin" : "no"))).toBe("from stdin");
	});

	it("reads a path relative to the working directory", () => {
		expect(readIssueBody("b.md", "/repo", (p) => `read ${String(p)}`)).toBe("read /repo/b.md");
	});
});
