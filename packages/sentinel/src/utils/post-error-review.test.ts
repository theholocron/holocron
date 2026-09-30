import { createGitHubClient } from "@theholocron/github-client";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { postErrorReview } from "./post-error-review.js";

function makeClient(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return { client: createGitHubClient({ token: "ghp_test", fetch }), calls };
}

const NO_THREADS = { data: { repository: { pullRequest: { reviewThreads: { nodes: [] } } } } };

function threadsResponse(
	nodes: Array<{
		id: string;
		isResolved: boolean;
		path: string | null;
		line: number | null;
		authorLogin: string;
		body: string;
	}>
) {
	return {
		data: {
			repository: {
				pullRequest: {
					reviewThreads: {
						nodes: nodes.map((n) => ({
							id: n.id,
							isResolved: n.isResolved,
							path: n.path,
							line: n.line,
							comments: { nodes: [{ author: { login: n.authorLogin }, body: n.body }] },
						})),
					},
				},
			},
		},
	};
}

describe("postErrorReview — no errors", () => {
	it("posts no review when there are no error-severity findings", async () => {
		const { client, calls } = makeClient([{ body: NO_THREADS }]);

		await postErrorReview({
			client,
			repo: "acme/demo",
			pullNumber: 42,
			headSha: "abc123",
			checkKey: "static-analysis",
			checkLabel: "static analysis",
			checkRunName: "Source Quality / Static Analysis / Run eslint",
			errors: [],
			warningCount: 3,
		});

		// Only the listReviewThreads lookup -- no createReview POST.
		expect(calls).toHaveLength(1);
		expect(calls[0]?.url).toContain("/graphql");
	});

	it("still resolves this check's own stale threads even when there are no current errors", async () => {
		const { client, calls } = makeClient([
			{
				body: threadsResponse([
					{
						id: "PRRT_1",
						isResolved: false,
						path: "src/index.ts",
						line: 12,
						authorLogin: "the-holocron-sentinel",
						body: "<!-- sentinel:static-analysis -->\n`no-unused-vars` (line 12): unused",
					},
				]),
			},
			{ body: { data: { resolveReviewThread: { thread: { id: "PRRT_1", isResolved: true } } } } },
		]);

		await postErrorReview({
			client,
			repo: "acme/demo",
			pullNumber: 42,
			headSha: "abc123",
			checkKey: "static-analysis",
			checkLabel: "static analysis",
			checkRunName: "Source Quality / Static Analysis / Run eslint",
			errors: [],
			warningCount: 0,
		});

		expect(calls).toHaveLength(2);
		const resolveBody = calls[1]?.body as { variables: Record<string, unknown> };
		expect(resolveBody.variables).toEqual({ threadId: "PRRT_1" });
	});
});

describe("postErrorReview — posting", () => {
	it("posts a review with a marked comment body per error, and no warning sentence when warningCount is 0", async () => {
		const { client, calls } = makeClient([
			{ body: NO_THREADS },
			{ body: { id: 1, html_url: "https://github.com/acme/demo/pull/42#pullrequestreview-1" } },
		]);

		await postErrorReview({
			client,
			repo: "acme/demo",
			pullNumber: 42,
			headSha: "abc123",
			checkKey: "static-analysis",
			checkLabel: "static analysis",
			checkRunName: "Source Quality / Static Analysis / Run eslint",
			errors: [{ file: "src/index.ts", line: 12, body: "`no-unused-vars` (line 12, col 7): unused" }],
			warningCount: 0,
		});

		expect(calls).toHaveLength(2);
		expect(calls[1]?.method).toBe("POST");
		expect(calls[1]?.url).toContain("/repos/acme/demo/pulls/42/reviews");
		expect(calls[1]?.body).toEqual({
			commit_id: "abc123",
			event: "COMMENT",
			body: "1 error(s) found by static analysis — see inline comments below.",
			comments: [
				{
					path: "src/index.ts",
					line: 12,
					side: "RIGHT",
					body: "<!-- sentinel:static-analysis -->\n`no-unused-vars` (line 12, col 7): unused",
				},
			],
		});
	});

	it("adds the warning sentence, naming the check run, when warningCount is nonzero", async () => {
		const { client, calls } = makeClient([
			{ body: NO_THREADS },
			{ body: { id: 2, html_url: "https://github.com/acme/demo/pull/42#pullrequestreview-2" } },
		]);

		await postErrorReview({
			client,
			repo: "acme/demo",
			pullNumber: 42,
			headSha: "abc123",
			checkKey: "markdown-lint",
			checkLabel: "markdown lint",
			checkRunName: "Source Quality / Documentation / Run markdownlint",
			errors: [{ file: "README.md", line: 1, body: "`MD041` (line 1): no h1" }],
			warningCount: 2,
		});

		const body = calls[1]?.body as { body: string };
		expect(body.body).toBe(
			"1 error(s) found by markdown lint — see inline comments below.\n" +
				"2 warning(s) also found; see the Source Quality / Documentation / Run markdownlint check run for the full list."
		);
	});
});

describe("postErrorReview — re-push thread resolution", () => {
	it("resolves a stale thread whose finding no longer appears in the current error list", async () => {
		const { client, calls } = makeClient([
			{
				body: threadsResponse([
					{
						id: "PRRT_STALE",
						isResolved: false,
						path: "src/index.ts",
						line: 5,
						authorLogin: "the-holocron-sentinel",
						body: "<!-- sentinel:static-analysis -->\n`no-unused-vars` (line 5): fixed already",
					},
				]),
			},
			{ body: { data: { resolveReviewThread: { thread: { id: "PRRT_STALE", isResolved: true } } } } },
			{ body: { id: 3, html_url: "https://github.com/acme/demo/pull/42#pullrequestreview-3" } },
		]);

		await postErrorReview({
			client,
			repo: "acme/demo",
			pullNumber: 42,
			headSha: "abc123",
			checkKey: "static-analysis",
			checkLabel: "static analysis",
			checkRunName: "Source Quality / Static Analysis / Run eslint",
			errors: [{ file: "src/other.ts", line: 9, body: "`no-unused-vars` (line 9): still broken" }],
			warningCount: 0,
		});

		expect(calls).toHaveLength(3);
		const resolveBody = calls[1]?.body as { query: string; variables: Record<string, unknown> };
		expect(resolveBody.query).toContain("resolveReviewThread");
		expect(resolveBody.variables).toEqual({ threadId: "PRRT_STALE" });
		expect(calls[2]?.url).toContain("/reviews");
	});

	it("leaves a still-current finding's thread untouched -- never calls resolveReviewThread for it", async () => {
		const stillCurrentBody = "<!-- sentinel:static-analysis -->\n`no-unused-vars` (line 5): still broken";
		const { client, calls } = makeClient([
			{
				body: threadsResponse([
					{
						id: "PRRT_LIVE",
						isResolved: false,
						path: "src/index.ts",
						line: 5,
						authorLogin: "the-holocron-sentinel",
						body: stillCurrentBody,
					},
				]),
			},
			{ body: { id: 4, html_url: "https://github.com/acme/demo/pull/42#pullrequestreview-4" } },
		]);

		await postErrorReview({
			client,
			repo: "acme/demo",
			pullNumber: 42,
			headSha: "abc123",
			checkKey: "static-analysis",
			checkLabel: "static analysis",
			checkRunName: "Source Quality / Static Analysis / Run eslint",
			errors: [{ file: "src/index.ts", line: 5, body: "`no-unused-vars` (line 5): still broken" }],
			warningCount: 0,
		});

		// listReviewThreads + createReview only -- no resolveReviewThread call.
		expect(calls).toHaveLength(2);
		expect(calls[1]?.url).toContain("/reviews");
	});

	it("never resolves an already-resolved thread", async () => {
		const { client, calls } = makeClient([
			{
				body: threadsResponse([
					{
						id: "PRRT_DONE",
						isResolved: true,
						path: "src/index.ts",
						line: 5,
						authorLogin: "the-holocron-sentinel",
						body: "<!-- sentinel:static-analysis -->\n`no-unused-vars` (line 5): long since fixed",
					},
				]),
			},
		]);

		await postErrorReview({
			client,
			repo: "acme/demo",
			pullNumber: 42,
			headSha: "abc123",
			checkKey: "static-analysis",
			checkLabel: "static analysis",
			checkRunName: "Source Quality / Static Analysis / Run eslint",
			errors: [],
			warningCount: 0,
		});

		expect(calls).toHaveLength(1);
	});

	it("never resolves a thread authored by someone other than Sentinel's own bot", async () => {
		const { client, calls } = makeClient([
			{
				body: threadsResponse([
					{
						id: "PRRT_HUMAN",
						isResolved: false,
						path: "src/index.ts",
						line: 5,
						authorLogin: "octocat",
						body: "<!-- sentinel:static-analysis -->\nthis looks like our marker but a human wrote it",
					},
				]),
			},
		]);

		await postErrorReview({
			client,
			repo: "acme/demo",
			pullNumber: 42,
			headSha: "abc123",
			checkKey: "static-analysis",
			checkLabel: "static analysis",
			checkRunName: "Source Quality / Static Analysis / Run eslint",
			errors: [],
			warningCount: 0,
		});

		expect(calls).toHaveLength(1);
	});

	it("never resolves a sibling check's own thread -- different checkKey marker", async () => {
		const { client, calls } = makeClient([
			{
				body: threadsResponse([
					{
						id: "PRRT_SIBLING",
						isResolved: false,
						path: "README.md",
						line: 1,
						authorLogin: "the-holocron-sentinel",
						body: "<!-- sentinel:markdown-lint -->\n`MD041` (line 1): no h1",
					},
				]),
			},
		]);

		await postErrorReview({
			client,
			repo: "acme/demo",
			pullNumber: 42,
			headSha: "abc123",
			checkKey: "static-analysis",
			checkLabel: "static analysis",
			checkRunName: "Source Quality / Static Analysis / Run eslint",
			errors: [],
			warningCount: 0,
		});

		expect(calls).toHaveLength(1);
	});
});
