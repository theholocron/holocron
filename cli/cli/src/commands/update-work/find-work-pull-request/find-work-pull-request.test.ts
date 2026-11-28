import { describe, expect, it } from "vitest";

import type { PullRequest } from "../../../plugin/index.js";
import { findWorkPullRequests } from "./find-work-pull-request.js";

const pr = (number: number, branch: string, state: PullRequest["state"] = "open"): PullRequest => ({
	number,
	title: "t",
	state,
	merged: false,
	branch,
	url: `u/${number}`,
});

describe("findWorkPullRequests", () => {
	const prs = [
		pr(5, "feat/2429-update-work"),
		pr(4, "feat/24290-other"),
		pr(3, "fix/eng-42-thing"),
		pr(2, "feat/2429-old", "closed"),
		pr(1, "main"),
	];

	it("finds the open pull request whose branch starts with the issue", () => {
		expect(findWorkPullRequests(prs, "#2429").map((p) => p.number)).toEqual([5]);
		expect(findWorkPullRequests(prs, "theholocron/holocron#2429").map((p) => p.number)).toEqual([5]);
	});

	it("matches a tracker key without case", () => {
		expect(findWorkPullRequests(prs, "ENG-42").map((p) => p.number)).toEqual([3]);
	});

	it("finds nothing for a key with no usable form or no branch", () => {
		expect(findWorkPullRequests(prs, "nonsense")).toEqual([]);
		expect(findWorkPullRequests(prs, "99")).toEqual([]);
	});
});
