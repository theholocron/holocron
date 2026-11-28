import { describe, expect, it } from "vitest";

import { discussionIdLine } from "./discussion-id-line.js";

describe("discussionIdLine", () => {
	it("links the id to the file at its path on the branch, the address in angle brackets", () => {
		expect(
			discussionIdLine("SPEC-0007", {
				repo: "theholocron/holocron",
				branch: "alpha",
				path: "docs/wiki/specifications/tech-a.spec.md",
			})
		).toBe(
			"[SPEC-0007](<https://github.com/theholocron/holocron/blob/alpha/docs/wiki/specifications/tech-a.spec.md>)"
		);
	});

	it("escapes what an address cannot hold, keeping the slashes of the branch and the path", () => {
		expect(discussionIdLine("ADR-0009", { repo: "o/r", branch: "release/v 1", path: "docs/a b#c.md" })).toBe(
			"[ADR-0009](<https://github.com/o/r/blob/release/v%201/docs/a%20b%23c.md>)"
		);
	});

	it("is the id alone when there is no file address to link to", () => {
		expect(discussionIdLine("SPEC-0007", undefined)).toBe("SPEC-0007");
	});
});
