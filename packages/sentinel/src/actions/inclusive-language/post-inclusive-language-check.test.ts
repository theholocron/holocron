import { createGitHubClient } from "@theholocron/github-client";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import {
	postInclusiveLanguageCheck,
	SENTINEL_INCLUSIVE_LANGUAGE_CHECK_RUN_NAME,
} from "./post-inclusive-language-check.js";

function makeClient(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return { client: createGitHubClient({ token: "ghp_test", fetch }), calls };
}

describe("postInclusiveLanguageCheck — carries the intent vocabulary through (D5)", () => {
	it("names the check run Source Quality / Inclusive Language / Run alex", () => {
		expect(SENTINEL_INCLUSIVE_LANGUAGE_CHECK_RUN_NAME).toBe("Source Quality / Inclusive Language / Run alex");
	});
});

describe("postInclusiveLanguageCheck — valid", () => {
	it("posts a success check run naming how many files passed", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { id: 1, conclusion: "success" } }]);

		const result = await postInclusiveLanguageCheck({
			client,
			repo: "acme/demo",
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
		expect(body.name).toBe(SENTINEL_INCLUSIVE_LANGUAGE_CHECK_RUN_NAME);
		expect(body.head_sha).toBe("abc123");
		expect(body.output.title).toBe("Inclusive language: OK");
		expect(body.output.summary).toBe("All 3 changed markdown file(s) pass.");
		const url = new URL(body.details_url);
		expect(url.origin + url.pathname).toBe("https://app.axiom.co/the-holocron-7bbe/query");
		const apl = (JSON.parse(url.searchParams.get("initForm")!) as { apl: string }).apl;
		expect(apl).toContain('runId == "run-1"');
		expect(apl).toContain('msg == "postInclusiveLanguageCheck: posted"');
		expect(body.output.text).toBe("Run ID: `run-1`");
	});
});

describe("postInclusiveLanguageCheck — findings", () => {
	it("posts a neutral (not failure) check run listing each finding, actionable from the check run alone", async () => {
		const { client } = makeClient([{ status: 201, body: { id: 2, conclusion: "neutral" } }]);

		const result = await postInclusiveLanguageCheck({
			client,
			repo: "acme/demo",
			headSha: "abc123",
			result: {
				valid: false,
				fileCount: 1,
				messages: [
					{
						file: "README.md",
						line: 3,
						column: 5,
						reason: "`He` may be insensitive, use `They` instead",
						ruleId: "he-she",
					},
				],
			},
			runId: "run-2",
		});

		// Advisory suggestions, not a hard gate -- "neutral", not "failure".
		expect(result.conclusion).toBe("neutral");
	});

	it("formats each message as one summary line: file:line:column: reason [ruleId]", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { id: 3, conclusion: "neutral" } }]);

		await postInclusiveLanguageCheck({
			client,
			repo: "acme/demo",
			headSha: "abc123",
			result: {
				valid: false,
				fileCount: 1,
				messages: [
					{
						file: "README.md",
						line: 3,
						column: 5,
						reason: "`He` may be insensitive, use `They` instead",
						ruleId: "he-she",
					},
				],
			},
			runId: "run-3",
		});

		const body = calls[0]?.body as { output: { title: string; summary: string; text: string } };
		expect(body.output.title).toBe("Inclusive language: 1 suggestion(s) across 1 file(s)");
		expect(body.output.summary).toBe("1 suggestion(s) across 1 file(s) — see details below.");
		expect(body.output.text).toContain("README.md:3:5: `He` may be insensitive, use `They` instead [he-she]");
		expect(body.output.text).toContain("Run ID: `run-3`");
	});
});
