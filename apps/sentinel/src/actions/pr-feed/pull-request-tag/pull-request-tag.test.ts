import { describe, expect, it } from "vitest";

import type { PullRequestState } from "../pr-feed.type.js";
import { pullRequestTag } from "./pull-request-tag.js";

const OPEN: PullRequestState = {
	repo: "theholocron/holocron",
	number: 1,
	title: "t",
	url: "https://github.com/theholocron/holocron/pull/1",
	author: "luke",
	authorIsBot: false,
	draft: false,
	merged: false,
	closed: false,
	createdAt: "2026-01-01T00:00:00Z",
	base: "alpha",
	requestedReviewers: [],
	review: "none",
	ci: "pending",
	mergeable: "clean",
};

describe("pullRequestTag", () => {
	it("is merged before anything else", () => {
		expect(pullRequestTag({ ...OPEN, merged: true, closed: true, draft: true, ci: "failing" })).toBe("merged");
	});

	it("is closed before a draft", () => {
		expect(pullRequestTag({ ...OPEN, closed: true, draft: true })).toBe("closed");
	});

	it("is draft before conflicts", () => {
		expect(pullRequestTag({ ...OPEN, draft: true, mergeable: "conflicting" })).toBe("draft");
	});

	it("is conflicts before failing", () => {
		expect(pullRequestTag({ ...OPEN, mergeable: "conflicting", ci: "failing" })).toBe("conflicts");
	});

	it("is failing before changes requested", () => {
		expect(pullRequestTag({ ...OPEN, ci: "failing", review: "changes_requested" })).toBe("failing");
	});

	it("is changes requested before ready", () => {
		expect(pullRequestTag({ ...OPEN, review: "changes_requested", ci: "passing" })).toBe("changes requested");
	});

	it("is ready when approved and passing", () => {
		expect(pullRequestTag({ ...OPEN, review: "approved", ci: "passing" })).toBe("ready");
	});

	it("is waiting when approved but CI has not passed", () => {
		expect(pullRequestTag({ ...OPEN, review: "approved", ci: "pending" })).toBe("waiting");
	});

	it("is waiting otherwise, even with unknown mergeability", () => {
		expect(pullRequestTag({ ...OPEN, mergeable: "unknown", ci: "passing" })).toBe("waiting");
	});
});
