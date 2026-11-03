import { describe, expect, it } from "vitest";

import { discussionPrLine } from "./discussion-pr-line.js";

describe("discussionPrLine", () => {
	it("names the pull request with its address in angle brackets", () => {
		expect(discussionPrLine({ number: 1538, url: "https://github.com/theholocron/holocron/pull/1538" })).toBe(
			"PR: [#1538](<https://github.com/theholocron/holocron/pull/1538>)"
		);
	});

	it("is empty when the pull request is not known", () => {
		expect(discussionPrLine(undefined)).toBe("");
	});
});
