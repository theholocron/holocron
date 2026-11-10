import { createGitHubClient } from "@theholocron/github-client";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { outsideDiffDigest } from "./outside-diff-digest/index.js";
import { postErrorReview } from "./post-error-review.js";

// A run posts only what is new (holocron#1950): the same finding is not posted again as a second thread, and a list of
// findings outside the diff is not repeated in a new review while it is the list the newest review gave.

function makeClient(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return { client: createGitHubClient({ token: "ghp_test", fetch }), calls };
}

const BOT = "the-holocron-sentinel";
const FILE = ".github/workflows/ci.yml";
const REVIEW_OK = { body: { id: 9, html_url: "https://github.com/acme/demo/pull/42#pullrequestreview-9" } };

const input = {
	repo: "acme/demo",
	pullNumber: 42,
	headSha: "abc123",
	checkKey: "actionlint",
	checkLabel: "actionlint",
	checkRunName: "Static Analysis / Run actionlint",
	warningCount: 0,
};

/** A `GET /pulls/{n}/files` response whose patch makes exactly `lines` commentable in `FILE`. */
const files = (...lines: number[]) => ({
	body: [
		{
			filename: FILE,
			status: "modified",
			patch: lines.map((l) => `@@ -${l},1 +${l},1 @@\n-old\n+new`).join("\n"),
		},
	],
});

const threads = (...nodes: Array<{ id: string; line: number; body: string; isResolved?: boolean }>) => ({
	body: {
		data: {
			repository: {
				pullRequest: {
					reviewThreads: {
						nodes: nodes.map((n) => ({
							id: n.id,
							isResolved: n.isResolved ?? false,
							path: FILE,
							line: n.line,
							comments: { nodes: [{ author: { login: BOT }, body: n.body }] },
						})),
					},
				},
			},
		},
	},
});

const review = (body: string | null | undefined, id = 1) => ({
	id,
	html_url: `https://github.com/acme/demo/pull/42#pullrequestreview-${id}`,
	state: "COMMENTED",
	user: { login: `${BOT}[bot]` },
	body,
});

const marked = (body: string) => `<!-- sentinel:actionlint -->\n${body}`;
const inlineA = { file: FILE, line: 20, body: "`expression` (line 20, col 9): bad" };
const inlineB = { file: FILE, line: 30, body: "`shell-check` (line 30, col 4): worse" };
const outside = { file: FILE, line: 3, body: "`job-needs` (line 3, col 3): missing job" };
const outsideMarker = (findings: Array<typeof outside>, key = "actionlint") =>
	`<!-- sentinel:${key}:outside:${outsideDiffDigest(findings)} -->`;

describe("postErrorReview: inline findings already on the pull request", () => {
	it("posts only the finding with no open thread of its own", async () => {
		const { client, calls } = makeClient([
			threads({ id: "T1", line: 20, body: marked(inlineA.body) }),
			files(20, 30),
			REVIEW_OK,
		]);

		await postErrorReview({ ...input, client, errors: [inlineA, inlineB] });

		const posted = calls[2]?.body as { body: string; comments: Array<{ line: number }> };
		expect(posted.comments.map((c) => c.line)).toEqual([30]);
		expect(posted.body).toContain("see inline comments below");
	});

	it("posts nothing, and does not list the files, when every finding has its open thread", async () => {
		const { client, calls } = makeClient([
			threads(
				{ id: "T1", line: 20, body: marked(inlineA.body) },
				{ id: "T2", line: 30, body: marked(inlineB.body) }
			),
		]);

		await postErrorReview({ ...input, client, errors: [inlineA, inlineB] });

		expect(calls).toHaveLength(1);
	});

	it("posts a finding again when its thread was resolved, as it is back", async () => {
		const { client, calls } = makeClient([
			threads({ id: "T1", line: 20, body: marked(inlineA.body), isResolved: true }),
			files(20),
			REVIEW_OK,
		]);

		await postErrorReview({ ...input, client, errors: [inlineA] });

		expect((calls[2]?.body as { comments: unknown[] }).comments).toHaveLength(1);
	});

	it("posts a finding whose text changed, and resolves the thread of the old text", async () => {
		const { client, calls } = makeClient([
			threads({ id: "T1", line: 20, body: marked("`expression` (line 20, col 9): the old reason") }),
			{ body: { data: { resolveReviewThread: { thread: { id: "T1", isResolved: true } } } } },
			files(20),
			REVIEW_OK,
		]);

		await postErrorReview({ ...input, client, errors: [inlineA] });

		expect(calls[3]?.url).toContain("/reviews");
		expect((calls[3]?.body as { comments: Array<{ body: string }> }).comments[0]?.body).toBe(marked(inlineA.body));
	});

	it("posts the same text on another line, which is another finding", async () => {
		const { client, calls } = makeClient([
			threads({ id: "T1", line: 21, body: marked(inlineA.body) }),
			files(20),
			REVIEW_OK,
		]);

		await postErrorReview({ ...input, client, errors: [inlineA] });

		expect(calls[2]?.url).toContain("/reviews");
	});

	it("ignores an open thread of a sibling check, which has another marker", async () => {
		const { client, calls } = makeClient([
			threads({ id: "T1", line: 20, body: `<!-- sentinel:markdown-lint -->\n${inlineA.body}` }),
			files(20),
			REVIEW_OK,
		]);

		await postErrorReview({ ...input, client, errors: [inlineA] });

		expect(calls[2]?.url).toContain("/reviews");
	});
});

describe("postErrorReview: findings outside the diff are not repeated", () => {
	it("posts nothing while the newest review of this check gave the same list", async () => {
		const { client, calls } = makeClient([
			threads(),
			files(20),
			{ body: [review(`2 error(s)\n${outsideMarker([outside])}\n1 of them on line(s) outside…`)] },
		]);

		await postErrorReview({ ...input, client, errors: [outside] });

		expect(calls).toHaveLength(3);
		expect(calls.some((c) => c.url.endsWith("/pulls/42/reviews") && c.method === "POST")).toBe(false);
	});

	it("posts the list again, with its new digest, when it changed", async () => {
		const other = { ...outside, line: 4, body: "`syntax-check` (line 4, col 1): oops" };
		const { client, calls } = makeClient([
			threads(),
			files(20),
			{ body: [review(`x\n${outsideMarker([outside])}\ny`)] },
			REVIEW_OK,
		]);

		await postErrorReview({ ...input, client, errors: [outside, other] });

		const posted = calls[3]?.body as { body: string };
		expect(posted.body).toContain(outsideMarker([outside, other]));
		expect(posted.body).toContain("2 of them on line(s) outside this PR's diff");
	});

	it("goes by the newest review that gave a list: an older equal one does not hide a newer, different one", async () => {
		const other = { ...outside, line: 4, body: "`syntax-check` (line 4, col 1): oops" };
		const { client, calls } = makeClient([
			threads(),
			files(20),
			{ body: [review(outsideMarker([outside]), 1), review(outsideMarker([other]), 2)] },
			REVIEW_OK,
		]);

		await postErrorReview({ ...input, client, errors: [outside] });

		expect(calls[3]?.url).toContain("/reviews");
	});

	it("goes by the newest review that gave a list: an older different one does not force a repeat", async () => {
		const other = { ...outside, line: 4, body: "`syntax-check` (line 4, col 1): oops" };
		const { client, calls } = makeClient([
			threads(),
			files(20),
			{
				body: [
					review(outsideMarker([other]), 1),
					review(outsideMarker([outside]), 2),
					review("an unrelated review", 3),
				],
			},
		]);

		await postErrorReview({ ...input, client, errors: [outside] });

		expect(calls).toHaveLength(3);
	});

	it("is not hidden by another check's review that gave the same list", async () => {
		const { client, calls } = makeClient([
			threads(),
			files(20),
			{ body: [review(outsideMarker([outside], "markdown-lint"))] },
			REVIEW_OK,
		]);

		await postErrorReview({ ...input, client, errors: [outside] });

		expect(calls[3]?.url).toContain("/reviews");
	});

	it("reads reviews with no body", async () => {
		const { client, calls } = makeClient([
			threads(),
			files(20),
			{ body: [review(null, 1), review(undefined, 2), review("", 3)] },
			REVIEW_OK,
		]);

		await postErrorReview({ ...input, client, errors: [outside] });

		expect(calls[3]?.url).toContain("/reviews");
	});

	it("posts a new inline finding without repeating the unchanged list, and keeps its digest out of the body", async () => {
		const { client, calls } = makeClient([
			threads(),
			files(20),
			{ body: [review(outsideMarker([outside]))] },
			REVIEW_OK,
		]);

		await postErrorReview({ ...input, client, errors: [inlineA, outside] });

		const posted = calls[3]?.body as { body: string; comments: unknown[] };
		expect(posted.comments).toHaveLength(1);
		expect(posted.body).toBe("2 error(s) found by actionlint — see inline comments below.");
	});

	it("does not ask for the reviews at all when nothing is outside the diff", async () => {
		const { client, calls } = makeClient([threads(), files(20), REVIEW_OK]);

		await postErrorReview({ ...input, client, errors: [inlineA] });

		expect(calls.map((c) => c.method)).toEqual(["POST", "GET", "POST"]);
	});
});
