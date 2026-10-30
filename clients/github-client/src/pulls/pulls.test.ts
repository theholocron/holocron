import { describe, expect, it } from "vitest";

import { createGitHubClient } from "../index.js";
import { REPO, stubFetch, TOKEN } from "../test-helpers.js";

const RAW_PR = {
	number: 42,
	title: "fix: something",
	state: "closed" as const,
	merged_at: "2026-08-28T00:00:00Z",
	html_url: "https://github.com/theholocron/test-repo/pull/42",
	head: { ref: "fix/something", sha: "abc1234" },
};

describe("pulls.getPullRequest", () => {
	it("GETs /repos/{owner}/{name}/pulls/{number}", async () => {
		const { fetch, calls } = stubFetch([{ body: RAW_PR }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		const result = await client.pulls.getPullRequest(REPO, 42);
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toContain("/repos/theholocron/test-repo/pulls/42");
		expect(result.number).toBe(42);
		expect(result.title).toBe("fix: something");
		expect(result.state).toBe("closed");
		expect(result.merged_at).toBe("2026-08-28T00:00:00Z");
		expect(result.head.ref).toBe("fix/something");
	});
});

describe("pulls.listPullRequests", () => {
	it("GETs one state, newest first, with the head sha", async () => {
		const { fetch, calls } = stubFetch([{ body: [RAW_PR] }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		const result = await client.pulls.listPullRequests(REPO, "closed");
		expect(calls[0]?.url).toContain("/repos/theholocron/test-repo/pulls?state=closed&sort=created&direction=desc");
		expect(calls[0]?.url).toContain("per_page=100&page=1");
		expect(result.map((pr) => pr.head.sha)).toEqual(["abc1234"]);
		expect(calls).toHaveLength(1);
	});

	it("reads the next page while a page comes back full, and stops at the first short one", async () => {
		const full = Array.from({ length: 100 }, (_, i) => ({ ...RAW_PR, number: i + 1 }));
		const { fetch, calls } = stubFetch([{ body: full }, { body: [{ ...RAW_PR, number: 101 }] }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		const result = await client.pulls.listPullRequests(REPO, "open");
		expect(result).toHaveLength(101);
		expect(calls.map((c) => c.url.match(/&page=(\d+)/)?.[1])).toEqual(["1", "2"]);
	});

	it("stops at the page limit instead of reading forever", async () => {
		const full = Array.from({ length: 100 }, (_, i) => ({ ...RAW_PR, number: i + 1 }));
		const { fetch, calls } = stubFetch(Array.from({ length: 101 }, () => ({ body: full })));
		const client = createGitHubClient({ token: TOKEN, fetch });
		const result = await client.pulls.listPullRequests(REPO, "closed");
		expect(calls).toHaveLength(100);
		expect(result).toHaveLength(10_000);
	});
});

describe("pulls.listCommits", () => {
	it("GETs /repos/{owner}/{name}/pulls/{number}/commits with per_page=100", async () => {
		const commits = [
			{ sha: "abc1234", commit: { message: "feat: 💥 add thing" } },
			{ sha: "def5678", commit: { message: "fix: 🐛 fix thing" } },
		];
		const { fetch, calls } = stubFetch([{ body: commits }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		const result = await client.pulls.listCommits(REPO, 42);
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toContain("/repos/theholocron/test-repo/pulls/42/commits");
		expect(calls[0]?.url).toContain("per_page=100");
		expect(result).toHaveLength(2);
		expect(result[0]?.sha).toBe("abc1234");
		expect(result[0]?.commit.message).toBe("feat: 💥 add thing");
	});

	it("passes through commit author/committer identity, the linked GitHub account, and parents", async () => {
		const commits = [
			{
				sha: "abc1234",
				commit: {
					message: "feat: add thing\n\nSigned-off-by: Ada Lovelace <ada@example.com>",
					author: { name: "Ada Lovelace", email: "ada@example.com" },
					committer: { name: "Ada Lovelace", email: "ada@example.com" },
				},
				author: { login: "ada", type: "User" as const },
				parents: [{ sha: "parent1" }],
			},
			{
				sha: "merge123",
				commit: {
					message: "Merge pull request #1",
					author: { name: "Ada Lovelace", email: "ada@example.com" },
					committer: { name: "GitHub", email: "noreply@github.com" },
				},
				author: null,
				parents: [{ sha: "parent1" }, { sha: "parent2" }],
			},
		];
		const { fetch } = stubFetch([{ body: commits }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		const result = await client.pulls.listCommits(REPO, 42);

		expect(result[0]?.commit.author).toEqual({ name: "Ada Lovelace", email: "ada@example.com" });
		expect(result[0]?.commit.committer).toEqual({ name: "Ada Lovelace", email: "ada@example.com" });
		expect(result[0]?.author).toEqual({ login: "ada", type: "User" });
		expect(result[0]?.parents).toEqual([{ sha: "parent1" }]);

		expect(result[1]?.author).toBeNull();
		expect(result[1]?.parents).toHaveLength(2);
	});
});

describe("pulls.listFiles", () => {
	it("GETs /repos/{owner}/{name}/pulls/{number}/files with per_page=100", async () => {
		const files = [
			{ filename: "README.md", status: "modified" as const, patch: "@@ -1,2 +1,2 @@\n # Title\n-old\n+new" },
			{ filename: "old-name.ts", status: "renamed" as const, previous_filename: "name.ts" },
		];
		const { fetch, calls } = stubFetch([{ body: files }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		const result = await client.pulls.listFiles(REPO, 42);
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toContain("/repos/theholocron/test-repo/pulls/42/files");
		expect(calls[0]?.url).toContain("per_page=100");
		expect(result).toHaveLength(2);
		expect(result[0]?.filename).toBe("README.md");
		expect(result[0]?.status).toBe("modified");
		expect(result[0]?.patch).toBe("@@ -1,2 +1,2 @@\n # Title\n-old\n+new");
		expect(result[1]?.previous_filename).toBe("name.ts");
		// Binary files and very large diffs come back with no patch at all.
		expect(result[1]?.patch).toBeUndefined();
	});
});

describe("pulls.createReview", () => {
	it("POSTs /repos/{owner}/{name}/pulls/{number}/reviews with the given body", async () => {
		const { fetch, calls } = stubFetch([
			{ body: { id: 99, html_url: "https://github.com/theholocron/test-repo/pull/42#pullrequestreview-99" } },
		]);
		const client = createGitHubClient({ token: TOKEN, fetch });

		const result = await client.pulls.createReview(REPO, 42, {
			commit_id: "abc123",
			body: "2 error(s) found — see inline comments below.",
			event: "COMMENT",
			comments: [{ path: "src/index.ts", line: 12, side: "RIGHT", body: "'x' is defined but never used." }],
		});

		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toContain("/repos/theholocron/test-repo/pulls/42/reviews");
		expect(calls[0]?.body).toEqual({
			commit_id: "abc123",
			body: "2 error(s) found — see inline comments below.",
			event: "COMMENT",
			comments: [{ path: "src/index.ts", line: 12, side: "RIGHT", body: "'x' is defined but never used." }],
		});
		expect(result.id).toBe(99);
		expect(result.html_url).toBe("https://github.com/theholocron/test-repo/pull/42#pullrequestreview-99");
	});

	it("submits a review with no inline comments -- a body-only review", async () => {
		const { fetch, calls } = stubFetch([
			{ body: { id: 100, html_url: "https://github.com/x/y/pull/1#pullrequestreview-100" } },
		]);
		const client = createGitHubClient({ token: TOKEN, fetch });

		await client.pulls.createReview(REPO, 42, {
			commit_id: "abc123",
			body: "All clear.",
			event: "COMMENT",
		});

		const body = calls[0]?.body as { comments?: unknown };
		expect(body.comments).toBeUndefined();
	});
});

describe("pulls.listReviewThreads", () => {
	it("POSTs a GraphQL query to /graphql with owner/name/number variables", async () => {
		const { fetch, calls } = stubFetch([
			{
				body: {
					data: {
						repository: {
							pullRequest: {
								reviewThreads: {
									nodes: [
										{
											id: "PRRT_1",
											isResolved: false,
											path: "src/index.ts",
											line: 12,
											comments: {
												nodes: [
													{
														author: { login: "the-holocron-sentinel[bot]" },
														body: "`no-unused-vars` (line 12): 'x' is defined but never used.",
													},
												],
											},
										},
										{
											id: "PRRT_2",
											isResolved: true,
											path: "README.md",
											line: 3,
											comments: { nodes: [{ author: { login: "octocat" }, body: "looks good" }] },
										},
									],
								},
							},
						},
					},
				},
			},
		]);
		const client = createGitHubClient({ token: TOKEN, fetch });

		const result = await client.pulls.listReviewThreads(REPO, 42);

		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toContain("/graphql");
		const body = calls[0]?.body as { query: string; variables: Record<string, unknown> };
		expect(body.variables).toEqual({ owner: "theholocron", name: "test-repo", number: 42 });
		expect(body.query).toContain("reviewThreads");
		expect(result).toEqual([
			{
				id: "PRRT_1",
				isResolved: false,
				path: "src/index.ts",
				line: 12,
				authorLogin: "the-holocron-sentinel[bot]",
				body: "`no-unused-vars` (line 12): 'x' is defined but never used.",
			},
			{
				id: "PRRT_2",
				isResolved: true,
				path: "README.md",
				line: 3,
				authorLogin: "octocat",
				body: "looks good",
			},
		]);
	});

	it("returns authorLogin/body undefined for a thread with no comments -- shouldn't happen in practice, but doesn't throw", async () => {
		const { fetch } = stubFetch([
			{
				body: {
					data: {
						repository: {
							pullRequest: {
								reviewThreads: {
									nodes: [
										{
											id: "PRRT_3",
											isResolved: false,
											path: null,
											line: null,
											comments: { nodes: [] },
										},
									],
								},
							},
						},
					},
				},
			},
		]);
		const client = createGitHubClient({ token: TOKEN, fetch });

		const result = await client.pulls.listReviewThreads(REPO, 42);

		expect(result[0]?.authorLogin).toBeUndefined();
		expect(result[0]?.body).toBeUndefined();
		expect(result[0]?.path).toBeNull();
		expect(result[0]?.line).toBeNull();
	});

	it("throws when the GraphQL response carries an errors array, even with a 200 status", async () => {
		const { fetch } = stubFetch([
			{ status: 200, body: { errors: [{ message: "Could not resolve to a PullRequest" }] } },
		]);
		const client = createGitHubClient({ token: TOKEN, fetch });

		const err = await client.pulls.listReviewThreads(REPO, 999).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(Error);
		expect((err as Error).message).toContain("Could not resolve to a PullRequest");
	});
});

describe("pulls.resolveReviewThread", () => {
	it("POSTs a GraphQL mutation to /graphql with the given threadId", async () => {
		const { fetch, calls } = stubFetch([
			{ body: { data: { resolveReviewThread: { thread: { id: "PRRT_1", isResolved: true } } } } },
		]);
		const client = createGitHubClient({ token: TOKEN, fetch });

		await client.pulls.resolveReviewThread("PRRT_1");

		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toContain("/graphql");
		const body = calls[0]?.body as { query: string; variables: Record<string, unknown> };
		expect(body.variables).toEqual({ threadId: "PRRT_1" });
		expect(body.query).toContain("resolveReviewThread");
	});
});
