import { describe, expect, it } from "vitest";

import { issueRef, workBranchName } from "./work-branch.js";

describe("issueRef", () => {
	it("reads a number in every GitHub spelling and a tracker key in lower case", () => {
		expect(issueRef("#2429")).toBe("2429");
		expect(issueRef(" 2429 ")).toBe("2429");
		expect(issueRef("theholocron/holocron#2429")).toBe("2429");
		expect(issueRef("ENG-42")).toBe("eng-42");
	});

	it("has nothing for a key it cannot read", () => {
		expect(issueRef("soon")).toBeUndefined();
	});
});

describe("workBranchName", () => {
	it("is <type>/<issue>-<slug>", () => {
		expect(workBranchName("feat", "#2429", "work-commands")).toBe("feat/2429-work-commands");
		expect(workBranchName("fix", "ENG-42", "x")).toBe("fix/eng-42-x");
		expect(workBranchName("fix", "nope", "x")).toBeUndefined();
	});
});
