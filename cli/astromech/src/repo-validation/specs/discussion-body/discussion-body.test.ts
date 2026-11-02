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
});
