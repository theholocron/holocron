import type {
	GitHubCheckRun,
	GitHubClient,
	GitHubPullRequest,
	GitHubPullRequestReview,
} from "@theholocron/github-client";
import { describe, expect, it, vi } from "vitest";

import { readPullRequestState } from "./read-pull-request-state.js";

const NOW = new Date("2026-11-06T12:00:00Z");

const PULL: GitHubPullRequest = {
	number: 7,
	title: "feat: a thing",
	state: "open",
	merged_at: null,
	html_url: "https://github.com/acme/widgets/pull/7",
	head: { ref: "feat/a", sha: "abc1234567" },
	draft: false,
	created_at: "2026-11-05T12:00:00Z",
	user: { login: "luke", type: "User" },
	base: { ref: "alpha" },
	requested_reviewers: [{ login: "leia" }],
	additions: 10,
	deletions: 2,
	changed_files: 3,
	mergeable: true,
	mergeable_state: "blocked",
};

const check = (over: Partial<GitHubCheckRun>): GitHubCheckRun => ({
	id: 1,
	name: "ci / Required checks",
	head_sha: "abc1234567",
	status: "completed",
	conclusion: "success",
	html_url: "https://example.test/c/1",
	...over,
});

const review = (login: string, state: string): GitHubPullRequestReview => ({
	id: 1,
	html_url: "https://example.test/r",
	state,
	user: { login },
});

function client(
	pull: GitHubPullRequest,
	reviews: GitHubPullRequestReview[] = [],
	checks: GitHubCheckRun[] = []
): GitHubClient {
	return {
		pulls: { getPullRequest: vi.fn(async () => pull), listReviews: vi.fn(async () => reviews) },
		checks: { listCheckRunsForRef: vi.fn(async () => checks) },
	} as unknown as GitHubClient;
}

const read = (c: GitHubClient) => readPullRequestState({ client: c, repo: "acme/widgets", number: 7, now: NOW });

describe("readPullRequestState", () => {
	it("maps the pull request, its diff and its head commit", async () => {
		const c = client(PULL);
		const snapshot = await read(c);
		expect(snapshot.state).toEqual({
			repo: "acme/widgets",
			number: 7,
			title: "feat: a thing",
			url: "https://github.com/acme/widgets/pull/7",
			author: "luke",
			authorIsBot: false,
			draft: false,
			merged: false,
			closed: false,
			createdAt: "2026-11-05T12:00:00Z",
			base: "alpha",
			requestedReviewers: ["leia"],
			review: "review_required",
			ci: "none",
			mergeable: "clean",
		});
		expect(snapshot).toMatchObject({
			headSha: "abc1234567",
			diff: { additions: 10, deletions: 2, changedFiles: 3 },
		});
		expect(snapshot.mergedBy).toBeUndefined();
		expect(c.checks.listCheckRunsForRef).toHaveBeenCalledWith("acme/widgets", "abc1234567");
	});

	it("falls back when GitHub omits the optional fields", async () => {
		const bare: GitHubPullRequest = { ...PULL };
		for (const key of [
			"draft",
			"created_at",
			"user",
			"base",
			"requested_reviewers",
			"additions",
			"deletions",
			"changed_files",
			"mergeable_state",
		] as const) {
			delete bare[key];
		}
		const { state, diff } = await read(client(bare));
		expect(state).toMatchObject({
			author: "unknown",
			draft: false,
			createdAt: NOW.toISOString(),
			base: "",
			requestedReviewers: [],
			review: "none",
			mergeable: "unknown",
		});
		expect(diff).toEqual({ additions: 0, deletions: 0, changedFiles: 0 });
	});

	it("marks a bot author, a merged pull request and who merged it", async () => {
		const snapshot = await read(
			client({
				...PULL,
				user: { login: "dependabot[bot]", type: "Bot" },
				state: "closed",
				merged_at: "2026-11-06T00:00:00Z",
				merged_by: { login: "han" },
			})
		);
		expect(snapshot.state).toMatchObject({ authorIsBot: true, merged: true, closed: true });
		expect(snapshot.mergedBy).toBe("han");
	});

	it("reads conflicts and an unknown mergeability", async () => {
		expect((await read(client({ ...PULL, mergeable_state: "dirty", mergeable: false }))).state.mergeable).toBe(
			"conflicting"
		);
		expect((await read(client({ ...PULL, mergeable_state: "unknown", mergeable: null }))).state.mergeable).toBe(
			"unknown"
		);
	});

	it("counts each reviewer's last decision and ignores comments", async () => {
		const states = async (reviews: GitHubPullRequestReview[]) => (await read(client(PULL, reviews))).state.review;
		expect(await states([review("a", "APPROVED"), review("a", "COMMENTED")])).toBe("approved");
		expect(await states([review("a", "APPROVED"), review("b", "CHANGES_REQUESTED")])).toBe("changes_requested");
		expect(await states([review("b", "CHANGES_REQUESTED"), review("b", "APPROVED")])).toBe("approved");
		expect(await states([review("a", "APPROVED"), review("a", "DISMISSED")])).toBe("review_required");
		expect(await states([{ id: 2, html_url: "x", state: "APPROVED", user: null }])).toBe("review_required");
	});

	it("reads the ci result from the aggregate's latest run", async () => {
		const ci = async (checks: GitHubCheckRun[]) => (await read(client(PULL, [], checks))).state.ci;
		expect(await ci([check({})])).toBe("passing");
		expect(await ci([check({ id: 1, conclusion: "failure" }), check({ id: 2, conclusion: "success" })])).toBe(
			"passing"
		);
		expect(await ci([check({ id: 3, conclusion: "success" }), check({ id: 2, conclusion: "failure" })])).toBe(
			"passing"
		);
		expect(await ci([check({ conclusion: "failure" })])).toBe("failing");
		expect(await ci([check({ conclusion: "timed_out" })])).toBe("failing");
		expect(await ci([check({ status: "in_progress", conclusion: null })])).toBe("pending");
		expect(await ci([check({ conclusion: "neutral" })])).toBe("none");
		expect(await ci([check({ conclusion: null })])).toBe("none");
		expect(await ci([check({ name: "test:unit / Conclusion" })])).toBe("none");
	});

	it("returns the check runs it read", async () => {
		const runs = [check({ id: 9, name: "lint" })];
		expect((await read(client(PULL, [], runs))).checkRuns).toBe(runs);
	});
});
