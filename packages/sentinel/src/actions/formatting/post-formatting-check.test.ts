import { createGitHubClient } from "@theholocron/github-client";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { postFormattingCheck, SENTINEL_FORMATTING_CHECK_RUN_NAME } from "./post-formatting-check.js";

function makeClient(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return { client: createGitHubClient({ token: "ghp_test", fetch }), calls };
}

describe("postFormattingCheck — carries the intent vocabulary through (D5)", () => {
	it("names the check run Source Quality / Formatting / Run prettier", () => {
		expect(SENTINEL_FORMATTING_CHECK_RUN_NAME).toBe("Source Quality / Formatting / Run prettier");
	});
});

describe("postFormattingCheck — valid", () => {
	it("posts a success check run naming how many files passed", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { id: 1, conclusion: "success" } }]);

		const result = await postFormattingCheck({
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
		expect(body.name).toBe(SENTINEL_FORMATTING_CHECK_RUN_NAME);
		expect(body.head_sha).toBe("abc123");
		expect(body.output.title).toBe("Formatting: OK");
		expect(body.output.summary).toBe("All 3 changed file(s) pass.");
		const url = new URL(body.details_url);
		expect(url.origin + url.pathname).toBe("https://app.axiom.co/the-holocron-7bbe/query");
		const apl = (JSON.parse(url.searchParams.get("initForm")!) as { apl: string }).apl;
		expect(apl).toContain('runId == "run-1"');
		expect(apl).toContain('msg == "postFormattingCheck: posted"');
		expect(body.output.text).toBe("Run ID: `run-1`");
	});
});

describe("postFormattingCheck — findings", () => {
	it("posts a neutral (not failure) check run listing each finding, actionable from the check run alone", async () => {
		const { client } = makeClient([{ status: 201, body: { id: 2, conclusion: "neutral" } }]);

		const result = await postFormattingCheck({
			client,
			repo: "acme/demo",
			headSha: "abc123",
			result: {
				valid: false,
				fileCount: 1,
				messages: [
					{
						file: "src/index.js",
						line: 1,
						reason: "Not formatted according to this org's shared prettier config — run `prettier --write` to fix.",
					},
				],
			},
			runId: "run-2",
		});

		// Advisory suggestions, not a hard gate -- "neutral", not "failure".
		expect(result.conclusion).toBe("neutral");
	});

	it("formats each message as one summary line: file:line: reason", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { id: 3, conclusion: "neutral" } }]);

		await postFormattingCheck({
			client,
			repo: "acme/demo",
			headSha: "abc123",
			result: {
				valid: false,
				fileCount: 1,
				messages: [{ file: "src/index.js", line: 12, reason: "reformat me" }],
			},
			runId: "run-3",
		});

		const body = calls[0]?.body as { output: { title: string; summary: string; text: string } };
		expect(body.output.title).toBe("Formatting: 1 file(s) need reformatting");
		expect(body.output.summary).toBe("1 of 1 changed file(s) need reformatting — see details below.");
		expect(body.output.text).toContain("src/index.js:12: reformat me");
		expect(body.output.text).toContain("Run ID: `run-3`");
	});
});

describe("postFormattingCheck — inline annotations (holocron#816)", () => {
	it("builds one annotation per message, at notice level", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { id: 4, conclusion: "neutral" } }]);

		await postFormattingCheck({
			client,
			repo: "acme/demo",
			headSha: "abc123",
			result: {
				valid: false,
				fileCount: 1,
				messages: [{ file: "src/index.js", line: 42, reason: "reformat me" }],
			},
			runId: "run-4",
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
				path: "src/index.js",
				start_line: 42,
				end_line: 42,
				annotation_level: "notice",
				message: "reformat me",
				title: "prettier",
			},
		]);
	});

	it("caps annotations at 50, GitHub's own per-request limit -- the full list still reaches output.text uncapped", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { id: 5, conclusion: "neutral" } }]);
		const messages = Array.from({ length: 55 }, (_, i) => ({
			file: `src/file-${i}.js`,
			line: 1,
			reason: `reason ${i}`,
		}));

		await postFormattingCheck({
			client,
			repo: "acme/demo",
			headSha: "abc123",
			result: { valid: false, fileCount: 55, messages },
			runId: "run-5",
		});

		const body = calls[0]?.body as { output: { annotations: unknown[]; text: string } };
		expect(body.output.annotations).toHaveLength(50);
		expect(body.output.text).toContain("reason 54");
	});

	it("posts an empty annotations array for a valid (no findings) result", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { id: 6, conclusion: "success" } }]);

		await postFormattingCheck({
			client,
			repo: "acme/demo",
			headSha: "abc123",
			result: { valid: true, fileCount: 2, messages: [] },
			runId: "run-6",
		});

		const body = calls[0]?.body as { output: { annotations: unknown[] } };
		expect(body.output.annotations).toEqual([]);
	});
});
