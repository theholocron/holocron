import { describe, expect, it } from "vitest";

import type { PullRequestState } from "../pr-feed.type.js";
import { renderPullRequest } from "./render-pull-request.js";

const NOW = new Date("2026-06-10T12:00:00Z");

const OPEN: PullRequestState = {
	repo: "theholocron/holocron",
	number: 123,
	title: "Add the feed",
	url: "https://github.com/theholocron/holocron/pull/123",
	author: "luke",
	authorIsBot: false,
	draft: false,
	merged: false,
	closed: false,
	createdAt: "2026-06-07T12:00:00Z",
	base: "alpha",
	requestedReviewers: [],
	review: "none",
	ci: "pending",
	mergeable: "clean",
};

describe("renderPullRequest", () => {
	it("titles the post with the repository name, without the owner", () => {
		expect(renderPullRequest(OPEN, NOW).title).toBe("holocron#123 Add the feed");
	});

	it("cuts a long title to 100 characters", () => {
		const { title } = renderPullRequest({ ...OPEN, title: "x".repeat(300) }, NOW);
		expect(title).toHaveLength(100);
		expect(title.endsWith("…")).toBe(true);
	});

	it("leaves a title of exactly 100 characters alone", () => {
		const prefix = "holocron#123 ";
		const { title } = renderPullRequest({ ...OPEN, title: "x".repeat(100 - prefix.length) }, NOW);
		expect(title).toHaveLength(100);
		expect(title.endsWith("…")).toBe(false);
	});

	it("links the pull request, shows the age and has no footer", () => {
		const { body } = renderPullRequest(OPEN, NOW);
		expect(body).toContain(
			"[theholocron/holocron#123 Add the feed](https://github.com/theholocron/holocron/pull/123)"
		);
		expect(body).toContain("by luke into `alpha`, opened 3 days ago");
		expect(body).not.toContain("-# sync");
	});

	it("names who was asked to review", () => {
		const { body } = renderPullRequest({ ...OPEN, requestedReviewers: ["leia", "han"] }, NOW);
		expect(body).toContain("Status: waiting on review from leia, han");
	});

	it("says waiting on review when nobody was asked", () => {
		expect(renderPullRequest(OPEN, NOW).body).toContain("Status: waiting on review\n");
	});

	it("says approved and changes requested", () => {
		expect(renderPullRequest({ ...OPEN, review: "approved" }, NOW).body).toContain("Status: approved");
		expect(renderPullRequest({ ...OPEN, review: "changes_requested" }, NOW).body).toContain(
			"Status: changes requested"
		);
	});

	it("marks a bot author", () => {
		expect(renderPullRequest({ ...OPEN, author: "dependabot[bot]", authorIsBot: true }, NOW).body).toContain(
			"by dependabot[bot] (bot) into"
		);
	});

	it("says draft, merged and closed", () => {
		expect(renderPullRequest({ ...OPEN, draft: true }, NOW).body).toContain("Status: draft");
		expect(renderPullRequest({ ...OPEN, merged: true, closed: true }, NOW).body).toContain("Status: merged");
		expect(renderPullRequest({ ...OPEN, closed: true }, NOW).body).toContain("Status: closed");
	});

	it.each([
		["passing", "CI: passing"],
		["failing", "CI: failing"],
		["pending", "CI: running"],
		["none", "CI: no result yet"],
	] as const)("shows ci %s", (ci, text) => {
		expect(renderPullRequest({ ...OPEN, ci }, NOW).body).toContain(text);
	});

	it("says it conflicts with its base, and only then", () => {
		expect(renderPullRequest({ ...OPEN, mergeable: "conflicting" }, NOW).body).toContain("Conflicts with `alpha`");
		expect(renderPullRequest(OPEN, NOW).body).not.toContain("Conflicts");
	});

	it("returns the tag", () => {
		expect(renderPullRequest({ ...OPEN, review: "approved", ci: "passing" }, NOW).tag).toBe("ready");
	});

	it("handles a repo with no owner", () => {
		expect(renderPullRequest({ ...OPEN, repo: "holocron" }, NOW).title).toBe("holocron#123 Add the feed");
	});
});
