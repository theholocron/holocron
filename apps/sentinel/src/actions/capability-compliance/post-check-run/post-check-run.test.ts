import { createGitHubClient } from "@theholocron/github-client";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { postCheckRun, SENTINEL_CHECK_RUN_NAME } from "./post-check-run.js";

function makeClient(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return { client: createGitHubClient({ token: "ghp_test", fetch }), calls };
}

describe("postCheckRun — compliant", () => {
	it("posts a success check run listing every declared capability", async () => {
		const { client, calls } = makeClient([
			{
				status: 201,
				body: { id: 1, name: SENTINEL_CHECK_RUN_NAME, head_sha: "abc123", conclusion: "success" },
			},
		]);

		const result = await postCheckRun({
			client,
			repo: "acme/demo",
			headSha: "abc123",
			capabilities: ["ci", "deployment", "source"],
			runId: "run-1",
		});

		expect(result).toEqual({ checkRunId: 1, conclusion: "success", htmlUrl: undefined });
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toContain("/check-runs");
		const body = calls[0]?.body as {
			name: string;
			head_sha: string;
			status: string;
			conclusion: string;
			output: { title: string; summary: string };
		};
		expect(body.name).toBe(SENTINEL_CHECK_RUN_NAME);
		expect(body.head_sha).toBe("abc123");
		expect(body.status).toBe("completed");
		expect(body.conclusion).toBe("success");
		expect(body.output.title).toBe("Capability compliance: OK");
		expect(body.output.summary).toBe(
			"This repo declares ci, deployment, source capabilities — all required capabilities present."
		);
	});

	it("posts details_url and an output.text breakdown including the runId", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { id: 5, conclusion: "success" } }]);

		await postCheckRun({
			client,
			repo: "acme/demo",
			headSha: "abc123",
			capabilities: ["ci", "source"],
			runId: "run-xyz",
		});

		const body = calls[0]?.body as {
			details_url: string;
			output: { text: string };
		};
		// A permalink filtered to this exact log line, not the bare dataset —
		// runId scopes it to the request, msg to this specific check within it.
		const url = new URL(body.details_url);
		expect(url.origin + url.pathname).toBe("https://app.axiom.co/the-holocron-7bbe/query");
		const apl = (JSON.parse(url.searchParams.get("initForm")!) as { apl: string }).apl;
		expect(apl).toContain('runId == "run-xyz"');
		expect(apl).toContain('msg == "postCheckRun: posted"');
		expect(body.output.text).toContain("Declared capabilities (2)");
		expect(body.output.text).toContain("ci, source");
		expect(body.output.text).toContain("all present");
		expect(body.output.text).toContain("Run ID: `run-xyz`");
	});

	it("handles a repo with capabilities beyond just the required baseline", async () => {
		const { client } = makeClient([{ status: 201, body: { id: 2, conclusion: "success" } }]);

		const result = await postCheckRun({
			client,
			repo: "acme/demo",
			headSha: "def456",
			capabilities: ["source", "ci", "vault", "auth"],
			runId: "run-1",
		});

		expect(result.conclusion).toBe("success");
	});
});

describe("postCheckRun — non-compliant", () => {
	it("posts a failure check run naming the missing capabilities", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { id: 3, conclusion: "failure" } }]);

		const result = await postCheckRun({
			client,
			repo: "acme/demo",
			headSha: "abc123",
			capabilities: ["source"],
			runId: "run-1",
		});

		expect(result.conclusion).toBe("failure");
		const body = calls[0]?.body as { conclusion: string; output: { title: string; summary: string } };
		expect(body.conclusion).toBe("failure");
		expect(body.output.title).toBe("Capability compliance: missing required capabilities");
		expect(body.output.summary).toBe("Missing: ci.");
		const bodyWithText = calls[0]?.body as { output: { text: string } };
		expect(bodyWithText.output.text).toContain("**Missing required:** ci");
	});

	it("lists every missing capability when none are present", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { id: 4, conclusion: "failure" } }]);

		await postCheckRun({ client, repo: "acme/demo", headSha: "abc123", capabilities: [], runId: "run-1" });

		const body = calls[0]?.body as { output: { summary: string; text: string } };
		expect(body.output.summary).toBe("Missing: source, ci.");
		expect(body.output.text).toContain("**Declared capabilities (0):** (none)");
	});
});

describe("postCheckRun — result shape", () => {
	it("returns the created check run's id, conclusion, and html_url", async () => {
		const { client } = makeClient([
			{
				status: 201,
				body: { id: 99, conclusion: "success", html_url: "https://github.com/acme/demo/runs/99" },
			},
		]);

		const result = await postCheckRun({
			client,
			repo: "acme/demo",
			headSha: "abc123",
			capabilities: ["source", "ci"],
			runId: "run-1",
		});

		expect(result).toEqual({
			checkRunId: 99,
			conclusion: "success",
			htmlUrl: "https://github.com/acme/demo/runs/99",
		});
	});
});
