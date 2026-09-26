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

describe("postInclusiveLanguageCheck — inline annotations (holocron#816)", () => {
	it("builds one annotation per message, at notice level", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { id: 4, conclusion: "neutral" } }]);

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
						line: 55,
						column: 1,
						reason: "Be careful with execution",
						ruleId: "execution",
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
				start_line: 55,
				end_line: 55,
				start_column: 1,
				end_column: 1,
				annotation_level: "notice",
				message: "Be careful with execution",
				title: "execution",
			},
		]);
	});

	it("elevates a retext-profanities message with profanitySeverity >= 1 to warning (holocron#816 follow-up)", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { id: 9, conclusion: "neutral" } }]);

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
						line: 1,
						column: 1,
						reason: "Be careful with `asshat`",
						ruleId: "asshat",
						source: "retext-profanities",
						profanitySeverity: 2,
					},
				],
			},
			runId: "run-9",
		});

		const body = calls[0]?.body as { output: { annotations: Array<{ annotation_level: string }> } };
		expect(body.output.annotations[0]?.annotation_level).toBe("warning");
	});

	it("keeps a retext-profanities message at notice when profanitySeverity is 0 -- likely a false positive (e.g. execute/kill)", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { id: 10, conclusion: "neutral" } }]);

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
						line: 1,
						column: 1,
						reason: "Be careful with `kill`",
						ruleId: "kill",
						source: "retext-profanities",
						profanitySeverity: 0,
					},
				],
			},
			runId: "run-10",
		});

		const body = calls[0]?.body as { output: { annotations: Array<{ annotation_level: string }> } };
		expect(body.output.annotations[0]?.annotation_level).toBe("notice");
	});

	it("keeps a retext-profanities message at notice when profanitySeverity is entirely absent, not just 0", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { id: 12, conclusion: "neutral" } }]);

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
						line: 1,
						column: 1,
						reason: "Be careful with `beaver`",
						ruleId: "beaver",
						source: "retext-profanities",
					},
				],
			},
			runId: "run-12",
		});

		const body = calls[0]?.body as { output: { annotations: Array<{ annotation_level: string }> } };
		expect(body.output.annotations[0]?.annotation_level).toBe("notice");
	});

	it("keeps a retext-equality message at notice regardless -- no severity rating to elevate on", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { id: 11, conclusion: "neutral" } }]);

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
						line: 1,
						column: 1,
						reason: "`He` may be insensitive, use `They` instead",
						ruleId: "he-she",
						source: "retext-equality",
					},
				],
			},
			runId: "run-11",
		});

		const body = calls[0]?.body as { output: { annotations: Array<{ annotation_level: string }> } };
		expect(body.output.annotations[0]?.annotation_level).toBe("notice");
	});

	it("omits start/end_column when column is 0 (alex's own fallback for a column-less message)", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { id: 5, conclusion: "neutral" } }]);

		await postInclusiveLanguageCheck({
			client,
			repo: "acme/demo",
			headSha: "abc123",
			result: {
				valid: false,
				fileCount: 1,
				messages: [{ file: "README.md", line: 10, column: 0, reason: "some reason", ruleId: "some-rule" }],
			},
			runId: "run-5",
		});

		const body = calls[0]?.body as { output: { annotations: Array<Record<string, unknown>> } };
		expect(body.output.annotations[0]).toEqual({
			path: "README.md",
			start_line: 10,
			end_line: 10,
			annotation_level: "notice",
			message: "some reason",
			title: "some-rule",
		});
	});

	it("skips a message with line 0 (lint-inclusive-language.ts's own fallback for a line-less message) -- can't be placed on the diff", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { id: 6, conclusion: "neutral" } }]);

		await postInclusiveLanguageCheck({
			client,
			repo: "acme/demo",
			headSha: "abc123",
			result: {
				valid: false,
				fileCount: 1,
				messages: [{ file: "README.md", line: 0, column: 0, reason: "some reason", ruleId: "some-rule" }],
			},
			runId: "run-6",
		});

		const body = calls[0]?.body as { output: { annotations: unknown[] } };
		expect(body.output.annotations).toEqual([]);
	});

	it("caps annotations at 50, GitHub's own per-request limit -- the full list still reaches output.text uncapped", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { id: 7, conclusion: "neutral" } }]);
		const messages = Array.from({ length: 55 }, (_, i) => ({
			file: "README.md",
			line: i + 1,
			column: 1,
			reason: `reason ${i}`,
			ruleId: "some-rule",
		}));

		await postInclusiveLanguageCheck({
			client,
			repo: "acme/demo",
			headSha: "abc123",
			result: { valid: false, fileCount: 1, messages },
			runId: "run-7",
		});

		const body = calls[0]?.body as { output: { annotations: unknown[]; text: string } };
		expect(body.output.annotations).toHaveLength(50);
		expect(body.output.text).toContain("reason 54");
	});

	it("posts an empty annotations array for a valid (no findings) result", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { id: 8, conclusion: "success" } }]);

		await postInclusiveLanguageCheck({
			client,
			repo: "acme/demo",
			headSha: "abc123",
			result: { valid: true, fileCount: 2, messages: [] },
			runId: "run-8",
		});

		const body = calls[0]?.body as { output: { annotations: unknown[] } };
		expect(body.output.annotations).toEqual([]);
	});
});
