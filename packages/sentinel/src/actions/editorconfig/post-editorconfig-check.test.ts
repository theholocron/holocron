import { createGitHubClient } from "@theholocron/github-client";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { postEditorConfigCheck, SENTINEL_EDITORCONFIG_CHECK_RUN_NAME } from "./post-editorconfig-check.js";

function makeClient(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return { client: createGitHubClient({ token: "ghp_test", fetch }), calls };
}

describe("postEditorConfigCheck — carries the intent vocabulary through (D5)", () => {
	it("names the check run Source Quality / Formatting / Run editorconfig", () => {
		expect(SENTINEL_EDITORCONFIG_CHECK_RUN_NAME).toBe("Source Quality / Formatting / Run editorconfig");
	});
});

describe("postEditorConfigCheck — valid", () => {
	it("posts a success check run naming how many files passed", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { id: 1, conclusion: "success" } }]);

		const result = await postEditorConfigCheck({
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
		expect(body.name).toBe(SENTINEL_EDITORCONFIG_CHECK_RUN_NAME);
		expect(body.head_sha).toBe("abc123");
		expect(body.output.title).toBe("Editorconfig: OK");
		expect(body.output.summary).toBe("All 3 changed file(s) pass.");
		const url = new URL(body.details_url);
		expect(url.origin + url.pathname).toBe("https://app.axiom.co/the-holocron-7bbe/query");
		const apl = (JSON.parse(url.searchParams.get("initForm")!) as { apl: string }).apl;
		expect(apl).toContain('runId == "run-1"');
		expect(apl).toContain('msg == "postEditorConfigCheck: posted"');
		expect(body.output.text).toBe("Run ID: `run-1`");
	});
});

describe("postEditorConfigCheck — findings", () => {
	it("posts a neutral (not failure) check run -- editorconfig findings are always advisory, no severity axis to split on", async () => {
		const { client } = makeClient([{ status: 201, body: { id: 2, conclusion: "neutral" } }]);

		const result = await postEditorConfigCheck({
			client,
			repo: "acme/demo",
			headSha: "abc123",
			result: {
				valid: false,
				fileCount: 1,
				messages: [{ file: "src/index.ts", line: 1, reason: "Trailing whitespace." }],
			},
			runId: "run-2",
		});

		expect(result.conclusion).toBe("neutral");
	});

	it("formats each message as one summary line: file:line: reason", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { id: 3, conclusion: "neutral" } }]);

		await postEditorConfigCheck({
			client,
			repo: "acme/demo",
			headSha: "abc123",
			result: {
				valid: false,
				fileCount: 1,
				messages: [{ file: "src/index.ts", line: 12, reason: "Missing final newline." }],
			},
			runId: "run-3",
		});

		const body = calls[0]?.body as { output: { title: string; summary: string; text: string } };
		expect(body.output.title).toBe("Editorconfig: 1 finding(s)");
		expect(body.output.summary).toBe("1 finding(s) across 1 changed file(s) — see details below.");
		expect(body.output.text).toContain("src/index.ts:12: Missing final newline.");
		expect(body.output.text).toContain("Run ID: `run-3`");
	});
});

describe("postEditorConfigCheck — inline annotations (holocron#816)", () => {
	it("builds one annotation per message, at notice level", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { id: 4, conclusion: "neutral" } }]);

		await postEditorConfigCheck({
			client,
			repo: "acme/demo",
			headSha: "abc123",
			result: {
				valid: false,
				fileCount: 1,
				messages: [{ file: "src/index.ts", line: 42, reason: "Trailing whitespace." }],
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
				path: "src/index.ts",
				start_line: 42,
				end_line: 42,
				annotation_level: "notice",
				message: "Trailing whitespace.",
				title: "editorconfig",
			},
		]);
	});

	it("caps annotations at 50, GitHub's own per-request limit -- the full list still reaches output.text uncapped", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { id: 5, conclusion: "neutral" } }]);
		const messages = Array.from({ length: 55 }, (_, i) => ({
			file: `src/file-${i}.ts`,
			line: 1,
			reason: `reason ${i}`,
		}));

		await postEditorConfigCheck({
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

		await postEditorConfigCheck({
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
