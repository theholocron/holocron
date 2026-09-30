import { createGitHubClient } from "@theholocron/github-client";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { postStaticAnalysisCheck, SENTINEL_STATIC_ANALYSIS_CHECK_RUN_NAME } from "./post-static-analysis-check.js";

function makeClient(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return { client: createGitHubClient({ token: "ghp_test", fetch }), calls };
}

/** postErrorReview()'s own listReviewThreads() lookup -- queued after every check-run response in these tests, an empty result unless a test says otherwise. */
const EMPTY_THREADS = { body: { data: { repository: { pullRequest: { reviewThreads: { nodes: [] } } } } } };
/** postErrorReview()'s own createReview() call -- queued whenever a test's messages include at least one error-severity finding. */
const REVIEW_POSTED = { body: { id: 999, html_url: "https://github.com/acme/demo/pull/42#pullrequestreview-999" } };

describe("postStaticAnalysisCheck — carries the intent vocabulary through (D5)", () => {
	it("names the check run Source Quality / Static Analysis / Run eslint", () => {
		expect(SENTINEL_STATIC_ANALYSIS_CHECK_RUN_NAME).toBe("Source Quality / Static Analysis / Run eslint");
	});
});

describe("postStaticAnalysisCheck — valid", () => {
	it("posts a success check run naming how many files passed", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { id: 1, conclusion: "success" } }, EMPTY_THREADS]);

		const result = await postStaticAnalysisCheck({
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
		expect(body.name).toBe(SENTINEL_STATIC_ANALYSIS_CHECK_RUN_NAME);
		expect(body.head_sha).toBe("abc123");
		expect(body.output.title).toBe("Static analysis: OK");
		expect(body.output.summary).toBe("All 3 changed file(s) pass.");
		const url = new URL(body.details_url);
		expect(url.origin + url.pathname).toBe("https://app.axiom.co/the-holocron-7bbe/query");
		const apl = (JSON.parse(url.searchParams.get("initForm")!) as { apl: string }).apl;
		expect(apl).toContain('runId == "run-1"');
		expect(apl).toContain('msg == "postStaticAnalysisCheck: posted"');
		expect(body.output.text).toBe("Run ID: `run-1`");
	});
});

describe("postStaticAnalysisCheck — findings", () => {
	it("posts a failure check run when any message is error-severity (holocron#860) -- a real merge-blocker, not advisory", async () => {
		const { client } = makeClient([
			{ status: 201, body: { id: 2, conclusion: "failure" } },
			EMPTY_THREADS,
			REVIEW_POSTED,
		]);

		const result = await postStaticAnalysisCheck({
			client,
			repo: "acme/demo",
			pullNumber: 42,
			headSha: "abc123",
			result: {
				valid: false,
				fileCount: 1,
				messages: [
					{
						file: "src/index.ts",
						line: 1,
						column: 7,
						ruleId: "@typescript-eslint/no-unused-vars",
						reason: "'x' is defined but never used",
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

		const result = await postStaticAnalysisCheck({
			client,
			repo: "acme/demo",
			pullNumber: 42,
			headSha: "abc123",
			result: {
				valid: false,
				fileCount: 1,
				messages: [
					{
						file: "src/index.ts",
						line: 1,
						column: 7,
						ruleId: "vitest/no-disabled-tests",
						reason: "test is disabled",
						severity: "warning",
					},
				],
			},
			runId: "run-2b",
		});

		expect(result.conclusion).toBe("neutral");
	});

	it("formats each message as one summary line: file:line:column: reason [rule-id]", async () => {
		const { client, calls } = makeClient([
			{ status: 201, body: { id: 3, conclusion: "failure" } },
			EMPTY_THREADS,
			REVIEW_POSTED,
		]);

		await postStaticAnalysisCheck({
			client,
			repo: "acme/demo",
			pullNumber: 42,
			headSha: "abc123",
			result: {
				valid: false,
				fileCount: 1,
				messages: [
					{
						file: "src/index.ts",
						line: 12,
						column: 3,
						ruleId: "@typescript-eslint/no-unused-vars",
						reason: "unused var",
						severity: "error",
					},
				],
			},
			runId: "run-3",
		});

		const body = calls[0]?.body as { output: { title: string; summary: string; text: string } };
		expect(body.output.title).toBe("Static analysis: 1 error(s), 0 warning(s)");
		expect(body.output.summary).toBe("1 error(s), 0 warning(s) across 1 changed file(s) — see details below.");
		expect(body.output.text).toContain("src/index.ts:12:3: unused var [@typescript-eslint/no-unused-vars]");
		expect(body.output.text).toContain("Run ID: `run-3`");
	});

	it("omits the [rule-id] suffix for a parse error (ruleId null)", async () => {
		const { client, calls } = makeClient([
			{ status: 201, body: { id: 4, conclusion: "failure" } },
			EMPTY_THREADS,
			REVIEW_POSTED,
		]);

		await postStaticAnalysisCheck({
			client,
			repo: "acme/demo",
			pullNumber: 42,
			headSha: "abc123",
			result: {
				valid: false,
				fileCount: 1,
				messages: [
					{
						file: "src/broken.ts",
						line: 1,
						column: 1,
						ruleId: null,
						reason: "Unexpected token",
						severity: "error",
					},
				],
			},
			runId: "run-4",
		});

		const body = calls[0]?.body as { output: { text: string } };
		expect(body.output.text).toContain("src/broken.ts:1:1: Unexpected token");
		expect(body.output.text).not.toContain("[null]");
	});
});

describe("postStaticAnalysisCheck — inline annotations (holocron#816)", () => {
	it("builds one annotation per warning-severity message, at notice level", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { id: 5, conclusion: "neutral" } }, EMPTY_THREADS]);

		await postStaticAnalysisCheck({
			client,
			repo: "acme/demo",
			pullNumber: 42,
			headSha: "abc123",
			result: {
				valid: false,
				fileCount: 1,
				messages: [
					{
						file: "src/index.ts",
						line: 42,
						column: 5,
						ruleId: "@typescript-eslint/no-unused-vars",
						reason: "unused var",
						severity: "warning",
					},
				],
			},
			runId: "run-5",
		});

		const body = calls[0]?.body as {
			output: {
				annotations: Array<{
					path: string;
					start_line: number;
					end_line: number;
					annotation_level: string;
					message: string;
					title: string;
				}>;
			};
		};
		expect(body.output.annotations).toEqual([
			{
				path: "src/index.ts",
				start_line: 42,
				end_line: 42,
				annotation_level: "notice",
				message: "unused var",
				title: "@typescript-eslint/no-unused-vars",
			},
		]);
	});

	it("titles a parse-error annotation 'parse error' when ruleId is null", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { id: 6, conclusion: "neutral" } }, EMPTY_THREADS]);

		await postStaticAnalysisCheck({
			client,
			repo: "acme/demo",
			pullNumber: 42,
			headSha: "abc123",
			result: {
				valid: false,
				fileCount: 1,
				messages: [
					{
						file: "src/broken.ts",
						line: 1,
						column: 1,
						ruleId: null,
						reason: "Unexpected token",
						severity: "warning",
					},
				],
			},
			runId: "run-6",
		});

		const body = calls[0]?.body as { output: { annotations: Array<{ title: string }> } };
		expect(body.output.annotations[0]?.title).toBe("parse error");
	});

	it("caps annotations at 50, GitHub's own per-request limit -- the full list still reaches output.text uncapped", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { id: 7, conclusion: "neutral" } }, EMPTY_THREADS]);
		const messages = Array.from({ length: 55 }, (_, i) => ({
			file: `src/file-${i}.ts`,
			line: 1,
			column: 1,
			ruleId: "some-rule",
			reason: `reason ${i}`,
			severity: "warning" as const,
		}));

		await postStaticAnalysisCheck({
			client,
			repo: "acme/demo",
			pullNumber: 42,
			headSha: "abc123",
			result: { valid: false, fileCount: 55, messages },
			runId: "run-7",
		});

		const body = calls[0]?.body as { output: { annotations: unknown[]; text: string } };
		expect(body.output.annotations).toHaveLength(50);
		expect(body.output.text).toContain("reason 54");
	});

	it("posts an empty annotations array for a valid (no findings) result", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { id: 8, conclusion: "success" } }, EMPTY_THREADS]);

		await postStaticAnalysisCheck({
			client,
			repo: "acme/demo",
			pullNumber: 42,
			headSha: "abc123",
			result: { valid: true, fileCount: 2, messages: [] },
			runId: "run-8",
		});

		const body = calls[0]?.body as { output: { annotations: unknown[] } };
		expect(body.output.annotations).toEqual([]);
	});

	it("excludes error-severity messages from annotations (holocron#860) -- they move to a PR review instead", async () => {
		const { client, calls } = makeClient([
			{ status: 201, body: { id: 9, conclusion: "failure" } },
			EMPTY_THREADS,
			REVIEW_POSTED,
		]);

		await postStaticAnalysisCheck({
			client,
			repo: "acme/demo",
			pullNumber: 42,
			headSha: "abc123",
			result: {
				valid: false,
				fileCount: 1,
				messages: [
					{
						file: "src/index.ts",
						line: 12,
						column: 7,
						ruleId: "@typescript-eslint/no-unused-vars",
						reason: "'x' is defined but never used",
						severity: "error",
					},
					{
						file: "src/index.ts",
						line: 20,
						column: 1,
						ruleId: "vitest/no-disabled-tests",
						reason: "test is disabled",
						severity: "warning",
					},
				],
			},
			runId: "run-9",
		});

		const body = calls[0]?.body as { output: { annotations: Array<{ title: string }>; text: string } };
		expect(body.output.annotations).toHaveLength(1);
		expect(body.output.annotations[0]?.title).toBe("vitest/no-disabled-tests");
		expect(body.output.text).toContain("'x' is defined but never used [@typescript-eslint/no-unused-vars]");
	});
});

describe("postStaticAnalysisCheck — PR review for error-severity findings (holocron#860)", () => {
	it("posts a review with one marked comment per error, naming the warning count and check run", async () => {
		const { client, calls } = makeClient([
			{ status: 201, body: { id: 10, conclusion: "failure" } },
			EMPTY_THREADS,
			REVIEW_POSTED,
		]);

		await postStaticAnalysisCheck({
			client,
			repo: "acme/demo",
			pullNumber: 42,
			headSha: "abc123",
			result: {
				valid: false,
				fileCount: 1,
				messages: [
					{
						file: "src/index.ts",
						line: 12,
						column: 7,
						ruleId: "@typescript-eslint/no-unused-vars",
						reason: "'x' is defined but never used",
						severity: "error",
					},
					{
						file: "src/index.ts",
						line: 20,
						column: 1,
						ruleId: "vitest/no-disabled-tests",
						reason: "test is disabled",
						severity: "warning",
					},
				],
			},
			runId: "run-10",
		});

		expect(calls).toHaveLength(3);
		expect(calls[2]?.url).toContain("/repos/acme/demo/pulls/42/reviews");
		expect(calls[2]?.body).toEqual({
			commit_id: "abc123",
			event: "COMMENT",
			body:
				"1 error(s) found by static analysis — see inline comments below.\n" +
				"1 warning(s) also found; see the Source Quality / Static Analysis / Run eslint check run for the full list.",
			comments: [
				{
					path: "src/index.ts",
					line: 12,
					side: "RIGHT",
					body: "<!-- sentinel:static-analysis -->\n`@typescript-eslint/no-unused-vars` (line 12, col 7): 'x' is defined but never used",
				},
			],
		});
	});

	it("posts no review at all when every message is warning-severity", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { id: 11, conclusion: "neutral" } }, EMPTY_THREADS]);

		await postStaticAnalysisCheck({
			client,
			repo: "acme/demo",
			pullNumber: 42,
			headSha: "abc123",
			result: {
				valid: false,
				fileCount: 1,
				messages: [
					{
						file: "src/index.ts",
						line: 20,
						column: 1,
						ruleId: "vitest/no-disabled-tests",
						reason: "test is disabled",
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
