import { createGitHubClient } from "@theholocron/github-client";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { postRegistryCheck, SENTINEL_REGISTRY_CHECK_RUN_NAME } from "./post-registry-check.js";
import type { ValidateRegistryResult } from "./validate-registry.js";

function makeClient(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return { client: createGitHubClient({ token: "ghp_test", fetch }), calls };
}

/** postErrorReview()'s own listReviewThreads() lookup. */
const EMPTY_THREADS = { body: { data: { repository: { pullRequest: { reviewThreads: { nodes: [] } } } } } };
/** postErrorReview()'s own listFiles() call -- the new package.json is in the diff. */
const FILES_IN_DIFF = {
	body: [
		{ filename: "packages/widget/package.json", status: "added", patch: `@@ -0,0 +1,5 @@\n${"+line\n".repeat(5)}` },
	],
};
const REVIEW_POSTED = { body: { id: 7, html_url: "https://github.com/acme/demo/pull/4#pullrequestreview-7" } };

const WIDGET = { name: "@theholocron/widget", file: "packages/widget/package.json", line: 2 };
const CLI = { name: "@theholocron/cli", file: "packages/cli/package.json", line: 2 };

function post(client: ReturnType<typeof makeClient>["client"], result: ValidateRegistryResult) {
	return postRegistryCheck({ client, repo: "acme/demo", pullNumber: 4, headSha: "abc123", result, runId: "run-1" });
}

describe("postRegistryCheck (holocron#925)", () => {
	it("names the check after the CI job, under the platform namespace", () => {
		expect(SENTINEL_REGISTRY_CHECK_RUN_NAME).toBe("Platform / Repo Validation / Validate registry consistency");
	});

	it("posts success naming the registry version, linked to its own Axiom log line", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { id: 1 } }, EMPTY_THREADS]);

		const result = await post(client, { checked: [CLI], missing: [], registryVersion: "1.14.0", valid: true });

		expect(result.conclusion).toBe("success");
		const body = calls[0]?.body as { name: string; details_url: string; output: Record<string, unknown> };
		expect(body.name).toBe(SENTINEL_REGISTRY_CHECK_RUN_NAME);
		expect(body.output).toMatchObject({
			title: "Registry: OK",
			summary: "All 1 public package(s) this PR touches are registered (@theholocron/registry-doc@1.14.0).",
			text: "Run ID: `run-1`",
			annotations: [],
		});
		expect(decodeURIComponent(body.details_url)).toContain('msg == \\"postRegistryCheck: posted\\"');
	});

	it("says there was nothing to check when the PR touches no public package", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { id: 2 } }, EMPTY_THREADS]);

		await post(client, { checked: [], missing: [], valid: true });

		expect((calls[0]?.body as { output: { summary: string } }).output.summary).toBe(
			"This PR changes no public package's package.json — nothing to check."
		);
	});

	it("fails an unregistered package with an annotation and a review on its name line", async () => {
		const { client, calls } = makeClient([
			{ status: 201, body: { id: 3 } },
			EMPTY_THREADS,
			FILES_IN_DIFF,
			REVIEW_POSTED,
		]);

		const result = await post(client, {
			checked: [CLI, WIDGET],
			missing: [WIDGET],
			registryVersion: "1.14.0",
			valid: false,
		});

		expect(result.conclusion).toBe("failure");
		const reason =
			"`@theholocron/widget` isn't in @theholocron/registry-doc@1.14.0 — add its entry in theholocron/docs and publish it.";
		const check = calls[0]?.body as { output: Record<string, unknown> };
		expect(check.output).toMatchObject({
			title: "Registry: 1 package(s) not registered",
			summary: "1 of 2 public package(s) this PR touches aren't registered (@theholocron/registry-doc@1.14.0).",
			text: "packages/widget/package.json:2: @theholocron/widget\n\nRun ID: `run-1`",
			annotations: [
				{
					path: "packages/widget/package.json",
					start_line: 2,
					end_line: 2,
					annotation_level: "failure",
					message: reason,
					title: "Not in the package registry",
				},
			],
		});
		expect(calls[3]?.body).toMatchObject({
			event: "COMMENT",
			comments: [
				{
					path: "packages/widget/package.json",
					line: 2,
					side: "RIGHT",
					body: `<!-- sentinel:registry -->\n${reason}`,
				},
			],
		});
	});
});
