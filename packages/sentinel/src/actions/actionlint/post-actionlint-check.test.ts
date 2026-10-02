import { createGitHubClient } from "@theholocron/github-client";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import type { ActionlintMessage } from "./lint-actionlint.js";
import { postActionlintCheck, SENTINEL_ACTIONLINT_CHECK_RUN_NAME } from "./post-actionlint-check.js";

function makeClient(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return { client: createGitHubClient({ token: "ghp_test", fetch }), calls };
}

/** postErrorReview()'s own listReviewThreads() lookup -- queued after every check-run response in these tests. */
const EMPTY_THREADS = { body: { data: { repository: { pullRequest: { reviewThreads: { nodes: [] } } } } } };
/** postErrorReview()'s own createReview() call -- queued whenever a test's messages include an error-severity finding. */
const REVIEW_POSTED = { body: { id: 999, html_url: "https://github.com/acme/demo/pull/42#pullrequestreview-999" } };

const ACTIONLINT_ERROR: ActionlintMessage = {
	file: ".github/workflows/ci.yml",
	line: 12,
	column: 3,
	ruleId: "job-needs",
	reason: 'job "b" needs job "c" which does not exist in this workflow',
	severity: "error",
};

const SHELLCHECK_INFO: ActionlintMessage = {
	file: ".github/workflows/ci.yml",
	line: 20,
	column: 16,
	ruleId: "SC2086",
	reason: "Double quote to prevent globbing and word splitting.",
	severity: "warning",
};

function post(client: ReturnType<typeof makeClient>["client"], messages: ActionlintMessage[], runId = "run-1") {
	return postActionlintCheck({
		client,
		repo: "acme/demo",
		pullNumber: 42,
		headSha: "abc123",
		result: { valid: messages.length === 0, fileCount: 1, messages },
		runId,
	});
}

describe("postActionlintCheck — carries the intent vocabulary through (D5)", () => {
	it("names the check run Source Quality / Static Analysis / Run actionlint", () => {
		expect(SENTINEL_ACTIONLINT_CHECK_RUN_NAME).toBe("Source Quality / Static Analysis / Run actionlint");
	});
});

describe("postActionlintCheck — valid", () => {
	it("posts a success check run naming how many workflow files passed, linked to its own Axiom log line", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { id: 1, conclusion: "success" } }, EMPTY_THREADS]);

		const result = await post(client, []);

		expect(result).toEqual({ checkRunId: 1, conclusion: "success", htmlUrl: undefined });
		const body = calls[0]?.body as {
			name: string;
			head_sha: string;
			details_url: string;
			output: { title: string; summary: string; text: string; annotations: unknown[] };
		};
		expect(body.name).toBe(SENTINEL_ACTIONLINT_CHECK_RUN_NAME);
		expect(body.head_sha).toBe("abc123");
		expect(body.output.title).toBe("actionlint: OK");
		expect(body.output.summary).toBe("All 1 changed workflow file(s) pass.");
		expect(body.output.text).toBe("Run ID: `run-1`");
		expect(body.output.annotations).toEqual([]);
		const url = new URL(body.details_url);
		const apl = (JSON.parse(url.searchParams.get("initForm")!) as { apl: string }).apl;
		expect(apl).toContain('msg == "postActionlintCheck: posted"');
	});
});

describe("postActionlintCheck — findings", () => {
	it("fails on any error-severity finding and lists every finding in output.text", async () => {
		const { client, calls } = makeClient([
			{ status: 201, body: { id: 2, conclusion: "failure" } },
			EMPTY_THREADS,
			REVIEW_POSTED,
		]);

		const result = await post(client, [ACTIONLINT_ERROR, SHELLCHECK_INFO], "run-2");

		expect(result.conclusion).toBe("failure");
		const body = calls[0]?.body as { output: { title: string; text: string } };
		expect(body.output.title).toBe("actionlint: 1 error(s), 1 warning(s)");
		expect(body.output.text).toBe(
			'.github/workflows/ci.yml:12:3: job "b" needs job "c" which does not exist in this workflow [job-needs]\n' +
				".github/workflows/ci.yml:20:16: Double quote to prevent globbing and word splitting. [SC2086]\n\n" +
				"Run ID: `run-2`"
		);
	});

	it("resolves to neutral when every finding is warning-severity, annotating each one and posting no review", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { id: 3, conclusion: "neutral" } }, EMPTY_THREADS]);

		const result = await post(client, [SHELLCHECK_INFO]);

		expect(result.conclusion).toBe("neutral");
		const body = calls[0]?.body as { output: { annotations: unknown[] } };
		expect(body.output.annotations).toEqual([
			{
				path: ".github/workflows/ci.yml",
				start_line: 20,
				end_line: 20,
				annotation_level: "notice",
				message: "Double quote to prevent globbing and word splitting.",
				title: "SC2086",
			},
		]);
		// checkRun + listReviewThreads only -- no createReview POST.
		expect(calls).toHaveLength(2);
	});

	it("caps annotations at 50 -- the full list still reaches output.text", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { id: 4, conclusion: "neutral" } }, EMPTY_THREADS]);

		await post(
			client,
			Array.from({ length: 60 }, (_, i) => ({ ...SHELLCHECK_INFO, line: i + 1 }))
		);

		const body = calls[0]?.body as { output: { annotations: unknown[]; text: string } };
		expect(body.output.annotations).toHaveLength(50);
		expect(body.output.text.split("\n").filter((l) => l.includes("[SC2086]"))).toHaveLength(60);
	});

	it("moves error-severity findings to a review under its own checkKey instead of annotating them", async () => {
		const { client, calls } = makeClient([
			{ status: 201, body: { id: 5, conclusion: "failure" } },
			EMPTY_THREADS,
			REVIEW_POSTED,
		]);

		await post(client, [ACTIONLINT_ERROR, SHELLCHECK_INFO]);

		const checkBody = calls[0]?.body as { output: { annotations: Array<{ title: string }> } };
		expect(checkBody.output.annotations.map((a) => a.title)).toEqual(["SC2086"]);
		expect(calls[2]?.url).toContain("/repos/acme/demo/pulls/42/reviews");
		expect(calls[2]?.body).toEqual({
			commit_id: "abc123",
			event: "COMMENT",
			body:
				"1 error(s) found by actionlint — see inline comments below.\n" +
				"1 warning(s) also found; see the Source Quality / Static Analysis / Run actionlint check run for the full list.",
			comments: [
				{
					path: ".github/workflows/ci.yml",
					line: 12,
					side: "RIGHT",
					body: '<!-- sentinel:actionlint -->\n`job-needs` (line 12, col 3): job "b" needs job "c" which does not exist in this workflow',
				},
			],
		});
	});
});
