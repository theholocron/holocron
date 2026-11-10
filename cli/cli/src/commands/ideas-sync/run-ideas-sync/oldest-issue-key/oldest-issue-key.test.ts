import { describe, expect, it } from "vitest";

import { oldestIssueKey } from "./oldest-issue-key.js";

describe("oldestIssueKey", () => {
	it("returns undefined for no keys", () => {
		expect(oldestIssueKey([])).toBeUndefined();
	});

	it("picks the lowest number, not the first or the longest string", () => {
		expect(oldestIssueKey(["#12", "#9", "#100"])).toBe("#9");
	});

	it("reads Linear keys", () => {
		expect(oldestIssueKey(["ENG-70", "ENG-7", "ENG-12"])).toBe("ENG-7");
	});

	it("reads owner/repo#N keys", () => {
		expect(oldestIssueKey(["theholocron/holocron#2040", "theholocron/holocron#12"])).toBe(
			"theholocron/holocron#12"
		);
	});

	it("is the same whatever the order of the keys", () => {
		expect(oldestIssueKey(["#5", "#3"])).toBe(oldestIssueKey(["#3", "#5"]));
	});

	it("breaks a tie on the number by the key text, so every run agrees", () => {
		expect(oldestIssueKey(["b/x#4", "a/x#4"])).toBe("a/x#4");
		expect(oldestIssueKey(["a/x#4", "b/x#4"])).toBe("a/x#4");
	});

	it("puts a key with no number last", () => {
		expect(oldestIssueKey(["odd", "#3"])).toBe("#3");
		expect(oldestIssueKey(["#3", "odd"])).toBe("#3");
	});
});
