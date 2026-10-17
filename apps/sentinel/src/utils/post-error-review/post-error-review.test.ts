import { createGitHubClient } from "@theholocron/github-client";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { commentableLines, postErrorReview } from "./post-error-review.js";

function makeClient(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return { client: createGitHubClient({ token: "ghp_test", fetch }), calls };
}

/** A `GET /pulls/{n}/files` response whose patch makes exactly `lines` (1-indexed, RIGHT side) commentable in `file`. */
function filesResponse(...files: Array<{ file: string; lines: number[] }>) {
	return {
		body: files.map(({ file, lines }) => ({
			filename: file,
			status: "modified",
			patch: lines.map((l) => `@@ -${l},1 +${l},1 @@\n-old\n+new`).join("\n"),
		})),
	};
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
			filesResponse({ file: "src/index.ts", lines: [12] }),
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

		expect(calls).toHaveLength(3);
		expect(calls[1]?.url).toContain("/repos/acme/demo/pulls/42/files");
		expect(calls[2]?.method).toBe("POST");
		expect(calls[2]?.url).toContain("/repos/acme/demo/pulls/42/reviews");
		expect(calls[2]?.body).toEqual({
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
			filesResponse({ file: "README.md", lines: [1] }),
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

		const body = calls[2]?.body as { body: string };
		expect(body.body).toBe(
			"1 error(s) found by markdown lint — see inline comments below.\n" +
				"2 warning(s) also found; see the Source Quality / Documentation / Run markdownlint check run for the full list."
		);
	});
});

describe("postErrorReview — findings outside the PR's diff (holocron#906)", () => {
	const input = {
		repo: "acme/demo",
		pullNumber: 42,
		headSha: "abc123",
		checkKey: "actionlint",
		checkLabel: "actionlint",
		checkRunName: "Source Quality / Static Analysis / Run actionlint",
		warningCount: 0,
	};

	it("keeps in-diff errors inline and lists the rest in the review body -- never a 422 for the whole review", async () => {
		const { client, calls } = makeClient([
			{ body: NO_THREADS },
			filesResponse({ file: ".github/workflows/ci.yml", lines: [20] }),
			{ body: { id: 5, html_url: "https://github.com/acme/demo/pull/42#pullrequestreview-5" } },
		]);

		await postErrorReview({
			...input,
			client,
			errors: [
				{ file: ".github/workflows/ci.yml", line: 20, body: "`expression` (line 20, col 9): bad" },
				{ file: ".github/workflows/ci.yml", line: 3, body: "`job-needs` (line 3, col 3): missing job" },
			],
		});

		expect(calls[2]?.body).toEqual({
			commit_id: "abc123",
			event: "COMMENT",
			body:
				"2 error(s) found by actionlint — see inline comments below.\n" +
				"1 of them on line(s) outside this PR's diff, so they can't be inline comments:\n" +
				"- `.github/workflows/ci.yml:3` — `job-needs` (line 3, col 3): missing job",
			comments: [
				{
					path: ".github/workflows/ci.yml",
					line: 20,
					side: "RIGHT",
					body: "<!-- sentinel:actionlint -->\n`expression` (line 20, col 9): bad",
				},
			],
		});
	});

	it("still posts a body-only review when every error is outside the diff, or its file has no patch at all", async () => {
		const { client, calls } = makeClient([
			{ body: NO_THREADS },
			{ body: [{ filename: "big.yml", status: "modified" }] },
			{ body: { id: 6, html_url: "https://github.com/acme/demo/pull/42#pullrequestreview-6" } },
		]);

		await postErrorReview({
			...input,
			client,
			errors: [{ file: "big.yml", line: 7, body: "`syntax-check` (line 7, col 1): oops" }],
		});

		expect(calls[2]?.body).toEqual({
			commit_id: "abc123",
			event: "COMMENT",
			body:
				"1 error(s) found by actionlint.\n" +
				"1 of them on line(s) outside this PR's diff, so they can't be inline comments:\n" +
				"- `big.yml:7` — `syntax-check` (line 7, col 1): oops",
			comments: [],
		});
	});

	it("doesn't resolve a still-current finding's thread just because it's now outside the diff", async () => {
		const body = "`job-needs` (line 3, col 3): missing job";
		const { client, calls } = makeClient([
			{
				body: threadsResponse([
					{
						id: "PRRT_OLD",
						isResolved: false,
						path: ".github/workflows/ci.yml",
						line: 3,
						authorLogin: "the-holocron-sentinel",
						body: `<!-- sentinel:actionlint -->\n${body}`,
					},
				]),
			},
			filesResponse({ file: ".github/workflows/ci.yml", lines: [40] }),
			{ body: { id: 7, html_url: "https://github.com/acme/demo/pull/42#pullrequestreview-7" } },
		]);

		await postErrorReview({ ...input, client, errors: [{ file: ".github/workflows/ci.yml", line: 3, body }] });

		// listReviewThreads + listFiles + createReview -- no resolveReviewThread call.
		expect(calls).toHaveLength(3);
		expect(calls[2]?.url).toContain("/reviews");
	});
});

describe("commentableLines", () => {
	it("returns every RIGHT-side context and added line in each hunk, never a removed one", () => {
		const patch = [
			"@@ -1,4 +1,5 @@",
			" a",
			"-b",
			"+B",
			"+B2",
			" c",
			" d",
			"@@ -20,2 +21,2 @@ jobs:",
			" x",
			"-y",
			"+Y",
			"\\ No newline at end of file",
		].join("\n");

		expect([...commentableLines(patch)]).toEqual([1, 2, 3, 4, 5, 21, 22]);
	});

	it("ignores anything before the first hunk header", () => {
		expect([...commentableLines("diff --git a/x b/x\n+not a hunk yet\n@@ -1 +1 @@\n+real")]).toEqual([1]);
	});

	it("handles a single-line hunk header without counts", () => {
		expect([...commentableLines("@@ -0,0 +1 @@\n+only")]).toEqual([1]);
	});

	it("is empty for a missing patch (binary file or very large diff)", () => {
		expect(commentableLines(undefined).size).toBe(0);
		expect(commentableLines("").size).toBe(0);
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
			filesResponse({ file: "src/other.ts", lines: [9] }),
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

		expect(calls).toHaveLength(4);
		const resolveBody = calls[1]?.body as { query: string; variables: Record<string, unknown> };
		expect(resolveBody.query).toContain("resolveReviewThread");
		expect(resolveBody.variables).toEqual({ threadId: "PRRT_STALE" });
		expect(calls[3]?.url).toContain("/reviews");
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
			filesResponse({ file: "src/index.ts", lines: [5] }),
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

		// listReviewThreads + listFiles + createReview only -- no resolveReviewThread call.
		expect(calls).toHaveLength(3);
		expect(calls[2]?.url).toContain("/reviews");
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
