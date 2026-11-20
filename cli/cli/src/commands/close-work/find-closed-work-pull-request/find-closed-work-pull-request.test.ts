import { describe, expect, it } from "vitest";

import type { PullRequest } from "../../../plugin/index.js";
import { findClosedWorkPullRequests } from "./find-closed-work-pull-request.js";

const pr = (number: number, branch: string, state: "open" | "closed", merged = false): PullRequest => ({
	number,
	title: "t",
	state,
	merged,
	branch,
	url: `https://x/${number}`,
});

describe("findClosedWorkPullRequests", () => {
	it("returns the merged pull requests of the issue before the unmerged ones, never an open one", () => {
		const found = findClosedWorkPullRequests(
			[
				pr(9, "feat/12-a", "closed"),
				pr(8, "feat/12-b", "open"),
				pr(7, "feat/12-c", "closed", true),
				pr(6, "fix/99-other", "closed", true),
			],
			"#12"
		);
		expect(found.map((p) => p.number)).toEqual([7, 9]);
	});

	it("finds a tracker key by its lower-cased form and nothing for an unusable key", () => {
		expect(findClosedWorkPullRequests([pr(1, "feat/eng-42-x", "closed", true)], "ENG-42")).toHaveLength(1);
		expect(findClosedWorkPullRequests([pr(1, "feat/eng-42-x", "closed", true)], "nope")).toEqual([]);
	});
});
