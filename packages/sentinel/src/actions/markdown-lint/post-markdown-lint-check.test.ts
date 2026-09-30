import { createGitHubClient } from "@theholocron/github-client";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { postMarkdownLintCheck, SENTINEL_MARKDOWN_LINT_CHECK_RUN_NAME } from "./post-markdown-lint-check.js";

function makeClient(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return { client: createGitHubClient({ token: "ghp_test", fetch }), calls };
}

/** postErrorReview()'s own listReviewThreads() lookup -- queued after every check-run response in these tests, an empty result unless a test says otherwise. */
const EMPTY_THREADS = { body: { data: { repository: { pullRequest: { reviewThreads: { nodes: [] } } } } } };
/** postErrorReview()'s own createReview() call -- queued whenever a test's messages include at least one error-severity finding. */
const REVIEW_POSTED = { body: { id: 999, html_url: "https://github.com/acme/demo/pull/42#pullrequestreview-999" } };

describe("postMarkdownLintCheck — carries the intent vocabulary through (D5)", () => {
	it("names the check run Source Quality / Documentation / Run markdownlint", () => {
		expect(SENTINEL_MARKDOWN_LINT_CHECK_RUN_NAME).toBe("Source Quality / Documentation / Run markdownlint");
	});
});

describe("postMarkdownLintCheck — valid", () => {
	it("posts a success check run naming how many files passed", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { id: 1, conclusion: "success" } }, EMPTY_THREADS]);

		const result = await postMarkdownLintCheck({
			client,
			repo: "acme/demo",
			pullNumber: 42,
			headSha: "abc123",
			result: { valid: true, fileCount: 3, messages: [] },
			runId: "run-1",
		});

		expect(result).toEqual({ checkRunId: 1, conclusion: "success", htmlUrl: undefined });
		expect(calls[0]?.method).toBe("POST");
		const body = calls[0]?.body as {
			name: string;
			head_sha: string;
			conclusion: string;
			details_url: string;
			output: { title: string; summary: string; text: string };
		};
		expect(body.name).toBe(SENTINEL_MARKDOWN_LINT_CHECK_RUN_NAME);
		expect(body.head_sha).toBe("abc123");
		expect(body.output.title).toBe("Markdown lint: OK");
		expect(body.output.summary).toBe("All 3 changed markdown file(s) pass.");
		const url = new URL(body.details_url);
		expect(url.origin + url.pathname).toBe("https://app.axiom.co/the-holocron-7bbe/query");
		const apl = (JSON.parse(url.searchParams.get("initForm")!) as { apl: string }).apl;
		expect(apl).toContain('runId == "run-1"');
		expect(apl).toContain('msg == "postMarkdownLintCheck: posted"');
		expect(body.output.text).toBe("Run ID: `run-1`");
	});
});

describe("postMarkdownLintCheck — findings", () => {
	it("posts a failure check run when any message is error-severity (holocron#860) -- a real merge-blocker, not advisory", async () => {
		const { client } = makeClient([
			{ status: 201, body: { id: 2, conclusion: "failure" } },
			EMPTY_THREADS,
			REVIEW_POSTED,
		]);

		const result = await postMarkdownLintCheck({
			client,
			repo: "acme/demo",
			pullNumber: 42,
			headSha: "abc123",
			result: {
				valid: false,
				fileCount: 1,
				messages: [
					{
						file: "README.md",
						line: 3,
						ruleNames: ["MD001", "heading-increment"],
						reason: "Heading levels should only increment by one level at a time",
						errorRange: null,
						severity: "error",
					},
				],
			},
			runId: "run-2",
		});

		expect(result.conclusion).toBe("failure");
	});

	it("posts a neutral (not failure) check run when every message is warning-severity", async () => {
		const { client } = makeClient([{ status: 201, body: { id: 2.5, conclusion: "neutral" } }, EMPTY_THREADS]);

		const result = await postMarkdownLintCheck({
			client,
			repo: "acme/demo",
			pullNumber: 42,
			headSha: "abc123",
			result: {
				valid: false,
				fileCount: 1,
				messages: [
					{
						file: "README.md",
						line: 3,
						ruleNames: ["MD013"],
						reason: "line too long",
						errorRange: null,
						severity: "warning",
					},
				],
			},
			runId: "run-2b",
		});

		expect(result.conclusion).toBe("neutral");
	});

	it("formats each message as one summary line: file:line: reason [rule-names]", async () => {
		const { client, calls } = makeClient([
			{ status: 201, body: { id: 3, conclusion: "failure" } },
			EMPTY_THREADS,
			REVIEW_POSTED,
		]);

		await postMarkdownLintCheck({
			client,
			repo: "acme/demo",
			pullNumber: 42,
			headSha: "abc123",
			result: {
				valid: false,
				fileCount: 1,
				messages: [
					{
						file: "README.md",
						line: 12,
						ruleNames: ["MD001", "heading-increment"],
						reason: "increment by one",
						errorRange: null,
						severity: "error",
					},
				],
			},
			runId: "run-3",
		});

		const body = calls[0]?.body as { output: { title: string; summary: string; text: string } };
		expect(body.output.title).toBe("Markdown lint: 1 error(s), 0 warning(s)");
		expect(body.output.summary).toBe(
			"1 error(s), 0 warning(s) across 1 changed markdown file(s) — see details below."
		);
		expect(body.output.text).toContain("README.md:12: increment by one [MD001/heading-increment]");
		expect(body.output.text).toContain("Run ID: `run-3`");
	});
});

describe("postMarkdownLintCheck — inline annotations (holocron#816)", () => {
	it("builds one annotation per warning-severity message, at notice level, with start/end column when errorRange is present", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { id: 4, conclusion: "neutral" } }, EMPTY_THREADS]);

		await postMarkdownLintCheck({
			client,
			repo: "acme/demo",
			pullNumber: 42,
			headSha: "abc123",
			result: {
				valid: false,
				fileCount: 1,
				messages: [
					{
						file: "README.md",
						line: 42,
						ruleNames: ["MD013"],
						reason: "line too long",
						errorRange: [5, 10],
						severity: "warning",
					},
				],
			},
			runId: "run-4",
		});

		const body = calls[0]?.body as {
			output: {
				annotations: Array<{
					path: string;
					start_line: number;
					end_line: number;
					start_column?: number;
					end_column?: number;
					annotation_level: string;
					message: string;
					title: string;
				}>;
			};
		};
		expect(body.output.annotations).toEqual([
			{
				path: "README.md",
				start_line: 42,
				end_line: 42,
				start_column: 5,
				end_column: 14,
				annotation_level: "notice",
				message: "line too long",
				title: "MD013",
			},
		]);
	});

	it("omits start/end column when errorRange is null", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { id: 5, conclusion: "neutral" } }, EMPTY_THREADS]);

		await postMarkdownLintCheck({
			client,
			repo: "acme/demo",
			pullNumber: 42,
			headSha: "abc123",
			result: {
				valid: false,
				fileCount: 1,
				messages: [
					{
						file: "README.md",
						line: 1,
						ruleNames: ["MD041"],
						reason: "no h1",
						errorRange: null,
						severity: "warning",
					},
				],
			},
			runId: "run-5",
		});

		const body = calls[0]?.body as { output: { annotations: Array<Record<string, unknown>> } };
		expect(body.output.annotations[0]).not.toHaveProperty("start_column");
		expect(body.output.annotations[0]).not.toHaveProperty("end_column");
	});

	it("caps annotations at 50, GitHub's own per-request limit -- the full list still reaches output.text uncapped", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { id: 6, conclusion: "neutral" } }, EMPTY_THREADS]);
		const messages = Array.from({ length: 55 }, (_, i) => ({
			file: `docs/file-${i}.md`,
			line: 1,
			ruleNames: ["MD001"],
			reason: `reason ${i}`,
			errorRange: null,
			severity: "warning" as const,
		}));

		await postMarkdownLintCheck({
			client,
			repo: "acme/demo",
			pullNumber: 42,
			headSha: "abc123",
			result: { valid: false, fileCount: 55, messages },
			runId: "run-6",
		});

		const body = calls[0]?.body as { output: { annotations: unknown[]; text: string } };
		expect(body.output.annotations).toHaveLength(50);
		expect(body.output.text).toContain("reason 54");
	});

	it("posts an empty annotations array for a valid (no findings) result", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { id: 7, conclusion: "success" } }, EMPTY_THREADS]);

		await postMarkdownLintCheck({
			client,
			repo: "acme/demo",
			pullNumber: 42,
			headSha: "abc123",
			result: { valid: true, fileCount: 2, messages: [] },
			runId: "run-7",
		});

		const body = calls[0]?.body as { output: { annotations: unknown[] } };
		expect(body.output.annotations).toEqual([]);
	});

	it("excludes error-severity messages from annotations (holocron#860) -- they move to a PR review instead", async () => {
		const { client, calls } = makeClient([
			{ status: 201, body: { id: 8, conclusion: "failure" } },
			EMPTY_THREADS,
			REVIEW_POSTED,
		]);

		await postMarkdownLintCheck({
			client,
			repo: "acme/demo",
			pullNumber: 42,
			headSha: "abc123",
			result: {
				valid: false,
				fileCount: 1,
				messages: [
					{
						file: "README.md",
						line: 1,
						ruleNames: ["MD041"],
						reason: "no h1",
						errorRange: null,
						severity: "error",
					},
					{
						file: "README.md",
						line: 2,
						ruleNames: ["MD013"],
						reason: "line too long",
						errorRange: null,
						severity: "warning",
					},
				],
			},
			runId: "run-8",
		});

		const body = calls[0]?.body as { output: { annotations: Array<{ title: string }>; text: string } };
		expect(body.output.annotations).toHaveLength(1);
		expect(body.output.annotations[0]?.title).toBe("MD013");
		expect(body.output.text).toContain("no h1 [MD041]");
	});
});

describe("postMarkdownLintCheck — PR review for error-severity findings (holocron#860)", () => {
	it("posts a review with one marked comment per error, naming the warning count and check run", async () => {
		const { client, calls } = makeClient([
			{ status: 201, body: { id: 9, conclusion: "failure" } },
			EMPTY_THREADS,
			REVIEW_POSTED,
		]);

		await postMarkdownLintCheck({
			client,
			repo: "acme/demo",
			pullNumber: 42,
			headSha: "abc123",
			result: {
				valid: false,
				fileCount: 1,
				messages: [
					{
						file: "README.md",
						line: 1,
						ruleNames: ["MD041"],
						reason: "no h1",
						errorRange: null,
						severity: "error",
					},
					{
						file: "README.md",
						line: 2,
						ruleNames: ["MD013"],
						reason: "line too long",
						errorRange: [5, 10],
						severity: "warning",
					},
				],
			},
			runId: "run-9",
		});

		expect(calls).toHaveLength(3);
		expect(calls[2]?.url).toContain("/repos/acme/demo/pulls/42/reviews");
		expect(calls[2]?.body).toEqual({
			commit_id: "abc123",
			event: "COMMENT",
			body:
				"1 error(s) found by markdown lint — see inline comments below.\n" +
				"1 warning(s) also found; see the Source Quality / Documentation / Run markdownlint check run for the full list.",
			comments: [
				{
					path: "README.md",
					line: 1,
					side: "RIGHT",
					body: "<!-- sentinel:markdown-lint -->\n`MD041` (line 1): no h1",
				},
			],
		});
	});

	it("includes the column in the comment body when errorRange localizes the finding", async () => {
		const { client, calls } = makeClient([
			{ status: 201, body: { id: 10, conclusion: "failure" } },
			EMPTY_THREADS,
			REVIEW_POSTED,
		]);

		await postMarkdownLintCheck({
			client,
			repo: "acme/demo",
			pullNumber: 42,
			headSha: "abc123",
			result: {
				valid: false,
				fileCount: 1,
				messages: [
					{
						file: "README.md",
						line: 42,
						ruleNames: ["MD013"],
						reason: "line too long",
						errorRange: [5, 10],
						severity: "error",
					},
				],
			},
			runId: "run-10",
		});

		const body = calls[2]?.body as { comments: Array<{ body: string }> };
		expect(body.comments[0]?.body).toBe("<!-- sentinel:markdown-lint -->\n`MD013` (line 42, col 5): line too long");
	});

	it("posts no review at all when every message is warning-severity", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { id: 11, conclusion: "neutral" } }, EMPTY_THREADS]);

		await postMarkdownLintCheck({
			client,
			repo: "acme/demo",
			pullNumber: 42,
			headSha: "abc123",
			result: {
				valid: false,
				fileCount: 1,
				messages: [
					{
						file: "README.md",
						line: 2,
						ruleNames: ["MD013"],
						reason: "line too long",
						errorRange: null,
						severity: "warning",
					},
				],
			},
			runId: "run-11",
		});

		// checkRun + listReviewThreads only -- no createReview POST.
		expect(calls).toHaveLength(2);
	});
});
