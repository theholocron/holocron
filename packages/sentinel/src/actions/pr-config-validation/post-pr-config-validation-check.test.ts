import { createGitHubClient } from "@theholocron/github-client";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import {
	postPrConfigValidationCheck,
	SENTINEL_PR_CONFIG_VALIDATION_CHECK_RUN_NAME,
} from "./post-pr-config-validation-check.js";

function makeClient(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return { client: createGitHubClient({ token: "ghp_test", fetch }), calls };
}

describe("postPrConfigValidationCheck — carries the intent vocabulary through (D5)", () => {
	it("names the check run Platform / PR Config Validation", () => {
		expect(SENTINEL_PR_CONFIG_VALIDATION_CHECK_RUN_NAME).toBe("Platform / PR Config Validation");
	});
});

describe("postPrConfigValidationCheck — valid", () => {
	it("posts a success check run", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { id: 1, conclusion: "success" } }]);

		const result = await postPrConfigValidationCheck({
			client,
			repo: "acme/demo",
			headSha: "abc123",
			result: { status: "valid", filepath: "holocron.config.ts", config: { tasks: [] } },
			runId: "run-1",
		});

		expect(result).toEqual({ checkRunId: 1, conclusion: "success", htmlUrl: undefined });
		const body = calls[0]?.body as { name: string; head_sha: string; output: { title: string; summary: string } };
		expect(body.name).toBe(SENTINEL_PR_CONFIG_VALIDATION_CHECK_RUN_NAME);
		expect(body.head_sha).toBe("abc123");
		expect(body.output.title).toBe("PR config: OK");
		expect(body.output.summary).toBe("holocron.config.ts on this PR's own branch is valid.");
	});
});

describe("postPrConfigValidationCheck — no-config", () => {
	it("posts a success check run -- no holocron.config.* is fine, not a failure", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { id: 2, conclusion: "success" } }]);

		const result = await postPrConfigValidationCheck({
			client,
			repo: "acme/demo",
			headSha: "abc123",
			result: { status: "no-config" },
			runId: "run-2",
		});

		expect(result.conclusion).toBe("success");
		const body = calls[0]?.body as { output: { title: string } };
		expect(body.output.title).toBe("PR config: OK (no holocron.config.*)");
	});
});

describe("postPrConfigValidationCheck — unknown-tasks", () => {
	it("posts a failure check run listing the unknown task names", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { id: 3, conclusion: "failure" } }]);

		const result = await postPrConfigValidationCheck({
			client,
			repo: "acme/demo",
			headSha: "abc123",
			result: { status: "unknown-tasks", filepath: "holocron.config.ts", unknownTasks: ["made-up-task"] },
			runId: "run-3",
		});

		expect(result.conclusion).toBe("failure");
		const body = calls[0]?.body as { output: { title: string; summary: string } };
		expect(body.output.title).toBe("PR config: 1 unknown task(s)");
		expect(body.output.summary).toContain("made-up-task");
	});
});

describe("postPrConfigValidationCheck — load-error", () => {
	it("posts a failure check run with the load error message", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { id: 4, conclusion: "failure" } }]);

		const result = await postPrConfigValidationCheck({
			client,
			repo: "acme/demo",
			headSha: "abc123",
			result: { status: "load-error", filepath: "holocron.config.ts", message: "SyntaxError: unexpected token" },
			runId: "run-4",
		});

		expect(result.conclusion).toBe("failure");
		const body = calls[0]?.body as { output: { title: string; summary: string } };
		expect(body.output.title).toBe("PR config: failed to load");
		expect(body.output.summary).toContain("SyntaxError: unexpected token");
	});
});
