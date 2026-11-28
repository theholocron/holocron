import { describe, expect, it } from "vitest";

import { discussionBody } from "./discussion-body.js";

const PR = { number: 1538, url: "https://github.com/theholocron/holocron/pull/1538" };

describe("discussionBody", () => {
	it("is the id, the description and the pull request, a paragraph each", () => {
		expect(discussionBody({ id: "SPEC-0007", summary: "A forum post for each spec.", pr: PR })).toBe(
			"SPEC-0007\n\nA forum post for each spec.\n\nPR: [#1538](<https://github.com/theholocron/holocron/pull/1538>)"
		);
	});

	it("leaves out the description when there is none, and the pull request when it is not known", () => {
		expect(discussionBody({ id: "ADR-0009", summary: "", pr: PR })).toBe(
			"ADR-0009\n\nPR: [#1538](<https://github.com/theholocron/holocron/pull/1538>)"
		);
		expect(discussionBody({ id: "ADR-0009", summary: "Why." })).toBe("ADR-0009\n\nWhy.");
		expect(discussionBody({ id: "ADR-0009", summary: "" })).toBe("ADR-0009");
	});

	it("links the id to the file when it is on the default branch", () => {
		expect(
			discussionBody({
				id: "SPEC-0007",
				summary: "Why.",
				file: { repo: "o/r", branch: "alpha", path: ".notes/tech-a.spec.md" },
			})
		).toBe("[SPEC-0007](<https://github.com/o/r/blob/alpha/.notes/tech-a.spec.md>)\n\nWhy.");
	});
});
