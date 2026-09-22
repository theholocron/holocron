import { createGitHubClient } from "@theholocron/github-client";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { postCommitStandardsCheck, SENTINEL_COMMIT_STANDARDS_CHECK_RUN_NAME } from "./post-commit-standards-check.js";

function makeClient(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return { client: createGitHubClient({ token: "ghp_test", fetch }), calls };
}

describe("postCommitStandardsCheck — carries the intent vocabulary through (D5)", () => {
	it("names the check run Sentinel / Platform / Commit Standards / Run commitlint", () => {
		expect(SENTINEL_COMMIT_STANDARDS_CHECK_RUN_NAME).toBe(
			"Sentinel / Platform / Commit Standards / Run commitlint"
		);
	});
});

describe("postCommitStandardsCheck — valid", () => {
	it("posts a success check run naming how many commits passed", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { id: 1, conclusion: "success" } }]);

		const result = await postCommitStandardsCheck({
			client,
			repo: "acme/demo",
			headSha: "abc123",
			result: { valid: true, commitCount: 3, violations: [] },
		});

		expect(result).toEqual({ checkRunId: 1, conclusion: "success", htmlUrl: undefined });
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toContain("/check-runs");
		const body = calls[0]?.body as {
			name: string;
			head_sha: string;
			conclusion: string;
			output: { title: string; summary: string };
		};
		expect(body.name).toBe(SENTINEL_COMMIT_STANDARDS_CHECK_RUN_NAME);
		expect(body.head_sha).toBe("abc123");
		expect(body.output.title).toBe("Commit standards: OK");
		expect(body.output.summary).toBe("All 3 commit(s) pass.");
	});
});

describe("postCommitStandardsCheck — invalid", () => {
	it("posts a failure check run listing each violation, actionable from the check run alone", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { id: 2, conclusion: "failure" } }]);

		const result = await postCommitStandardsCheck({
			client,
			repo: "acme/demo",
			headSha: "def456",
			result: {
				valid: false,
				commitCount: 2,
				violations: [
					{ sha: "bad00011234567", rule: "subject-empty", message: "subject may not be empty" },
					{ sha: "bad00011234567", rule: "type-empty", message: "type may not be empty" },
				],
			},
		});

		expect(result.conclusion).toBe("failure");
		const body = calls[0]?.body as { output: { title: string; summary: string } };
		expect(body.output.title).toBe("Commit standards: 2 violation(s) across 1 commit(s)");
		expect(body.output.summary).toBe(
			"bad0001: subject may not be empty [subject-empty]\nbad0001: type may not be empty [type-empty]"
		);
	});

	it("counts distinct commits, not just violation count, in the title", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { id: 3, conclusion: "failure" } }]);

		await postCommitStandardsCheck({
			client,
			repo: "acme/demo",
			headSha: "ghi789",
			result: {
				valid: false,
				commitCount: 2,
				violations: [
					{ sha: "aaa0001", rule: "subject-empty", message: "subject may not be empty" },
					{ sha: "bbb0002", rule: "type-empty", message: "type may not be empty" },
				],
			},
		});

		const body = calls[0]?.body as { output: { title: string } };
		expect(body.output.title).toBe("Commit standards: 2 violation(s) across 2 commit(s)");
	});
});
