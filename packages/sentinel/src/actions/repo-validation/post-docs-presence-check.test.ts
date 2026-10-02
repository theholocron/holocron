import { createGitHubClient } from "@theholocron/github-client";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { postDocsPresenceCheck, SENTINEL_DOCS_PRESENCE_CHECK_RUN_NAME } from "./post-docs-presence-check.js";
import type { ValidateDocsPresenceResult } from "./validate-docs-presence.js";

function makeClient() {
	const { fetch, calls } = stubFetch([{ status: 201, body: { id: 1, html_url: "https://x/1" } }]);
	return { client: createGitHubClient({ token: "ghp_test", fetch }), calls };
}

async function post(result: ValidateDocsPresenceResult) {
	const { client, calls } = makeClient();
	const posted = await postDocsPresenceCheck({
		client,
		repo: "acme/demo",
		headSha: "abc123",
		result,
		runId: "run-1",
	});
	const body = calls[0]?.body as {
		name: string;
		conclusion: string;
		details_url: string;
		output: { title: string; summary: string; text: string; annotations: unknown[] };
	};
	return { posted, body };
}

const WIDGET = { name: "widget", entry: "packages/widget/src/index.ts" };

describe("postDocsPresenceCheck", () => {
	it("names the check after the CI job, under the platform namespace", () => {
		expect(SENTINEL_DOCS_PRESENCE_CHECK_RUN_NAME).toBe("Platform / Repo Validation / Validate docs presence");
	});

	it("posts success when the PR adds no public package", async () => {
		const { posted, body } = await post({ newPackages: [], hasDocsChange: false, valid: true });

		expect(posted).toEqual({ checkRunId: 1, conclusion: "success", htmlUrl: "https://x/1" });
		expect(body.name).toBe(SENTINEL_DOCS_PRESENCE_CHECK_RUN_NAME);
		expect(body.output).toEqual({
			title: "Docs presence: OK",
			summary: "No new public packages.",
			text: "Run ID: `run-1`",
			annotations: [],
		});
		expect(decodeURIComponent(body.details_url)).toContain('msg == \\"postDocsPresenceCheck: posted\\"');
	});

	it("posts success when the new package comes with a docs change", async () => {
		const { body } = await post({ newPackages: [WIDGET], hasDocsChange: true, valid: true });

		expect(body.conclusion).toBe("success");
		expect(body.output.summary).toBe("New public package(s) widget come with a docs change.");
		expect(body.output.annotations).toEqual([]);
	});

	it("is neutral -- never failure -- with one annotation per package when docs are missing", async () => {
		const { body } = await post({
			newPackages: [WIDGET, { name: "gadget", entry: "packages/gadget/src/index.ts" }],
			hasDocsChange: false,
			valid: false,
		});

		expect(body.conclusion).toBe("neutral");
		expect(body.output.title).toBe("Docs presence: 2 new package(s) without a docs change");
		expect(body.output.summary).toMatch(
			/^New public package\(s\) widget, gadget added without any change under docs\//
		);
		expect(body.output.annotations).toEqual([
			expect.objectContaining({
				path: "packages/widget/src/index.ts",
				start_line: 1,
				annotation_level: "notice",
			}),
			expect.objectContaining({
				path: "packages/gadget/src/index.ts",
				start_line: 1,
				annotation_level: "notice",
			}),
		]);
	});
});
