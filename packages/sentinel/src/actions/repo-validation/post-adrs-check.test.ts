import { createGitHubClient } from "@theholocron/github-client";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { postAdrsCheck, SENTINEL_ADRS_CHECK_RUN_NAME } from "./post-adrs-check.js";
import type { AdrMessage } from "./validate-adrs.js";

function makeClient(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return { client: createGitHubClient({ token: "ghp_test", fetch }), calls };
}

/** postErrorReview()'s own listReviewThreads() lookup. */
const EMPTY_THREADS = { body: { data: { repository: { pullRequest: { reviewThreads: { nodes: [] } } } } } };
/** postErrorReview()'s own listFiles() call -- every line of the ADR is in the diff. */
const FILES_IN_DIFF = {
	body: [
		{
			filename: "docs/wiki/decisions/0009-x.md",
			status: "modified",
			patch: `@@ -0,0 +1,20 @@\n${"+line\n".repeat(20)}`,
		},
	],
};
const REVIEW_POSTED = { body: { id: 7, html_url: "https://github.com/acme/demo/pull/4#pullrequestreview-7" } };

const ID_ERROR: AdrMessage = {
	file: "docs/wiki/decisions/0009-x.md",
	line: 2,
	rule: "id",
	reason: 'id "ADR-0010" does not match filename sequence (expected ADR-0009)',
	severity: "error",
};
const ISSUE_WARNING: AdrMessage = {
	file: ".notes/tech-x.spec.md",
	line: 1,
	rule: "issue",
	reason: "missing `issue` field — every spec must have a companion GitHub issue",
	severity: "warning",
};

function post(client: ReturnType<typeof makeClient>["client"], messages: AdrMessage[]) {
	return postAdrsCheck({
		client,
		repo: "acme/demo",
		pullNumber: 4,
		headSha: "abc123",
		result: { valid: messages.length === 0, fileCount: 2, messages },
		runId: "run-1",
	});
}

describe("postAdrsCheck", () => {
	it("names the check after the CI job, under the platform namespace", () => {
		expect(SENTINEL_ADRS_CHECK_RUN_NAME).toBe("Platform / Repo Validation / Validate ADRs and specs");
	});

	it("posts success for a clean result, linked to its own Axiom log line", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { id: 1 } }, EMPTY_THREADS]);

		const result = await post(client, []);

		expect(result.conclusion).toBe("success");
		const body = calls[0]?.body as { name: string; details_url: string; output: Record<string, unknown> };
		expect(body.name).toBe(SENTINEL_ADRS_CHECK_RUN_NAME);
		expect(body.output).toMatchObject({
			title: "ADRs and specs: OK",
			summary: "All 2 changed ADR/spec file(s) pass.",
			text: "Run ID: `run-1`",
			annotations: [],
		});
		expect(decodeURIComponent(body.details_url)).toContain('msg == \\"postAdrsCheck: posted\\"');
	});

	it("fails on an error, posting it as a review and the warning as an annotation", async () => {
		const { client, calls } = makeClient([
			{ status: 201, body: { id: 2 } },
			EMPTY_THREADS,
			FILES_IN_DIFF,
			REVIEW_POSTED,
		]);

		const result = await post(client, [ID_ERROR, ISSUE_WARNING]);

		expect(result.conclusion).toBe("failure");
		const check = calls[0]?.body as { output: { title: string; text: string; annotations: unknown[] } };
		expect(check.output.title).toBe("ADRs and specs: 1 error(s), 1 warning(s)");
		expect(check.output.text).toBe(
			'docs/wiki/decisions/0009-x.md:2: id "ADR-0010" does not match filename sequence (expected ADR-0009) [id]\n' +
				".notes/tech-x.spec.md:1: missing `issue` field — every spec must have a companion GitHub issue [issue]\n\n" +
				"Run ID: `run-1`"
		);
		expect(check.output.annotations).toEqual([
			{
				path: ".notes/tech-x.spec.md",
				start_line: 1,
				end_line: 1,
				annotation_level: "notice",
				message: "missing `issue` field — every spec must have a companion GitHub issue",
				title: "issue",
			},
		]);
		expect(calls[3]?.body).toMatchObject({
			event: "COMMENT",
			comments: [
				{
					path: "docs/wiki/decisions/0009-x.md",
					line: 2,
					side: "RIGHT",
					body: '<!-- sentinel:adrs -->\n`id` (line 2): id "ADR-0010" does not match filename sequence (expected ADR-0009)',
				},
			],
		});
	});

	it("is neutral with no review when every finding is a warning", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { id: 3 } }, EMPTY_THREADS]);

		const result = await post(client, [ISSUE_WARNING]);

		expect(result.conclusion).toBe("neutral");
		expect(calls).toHaveLength(2);
	});

	it("caps annotations at 50", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { id: 4 } }, EMPTY_THREADS]);

		await post(
			client,
			Array.from({ length: 55 }, (_, i) => ({ ...ISSUE_WARNING, file: `.notes/s${i}.spec.md` }))
		);

		expect((calls[0]?.body as { output: { annotations: unknown[] } }).output.annotations).toHaveLength(50);
	});
});
