import { createGitHubClient } from "@theholocron/github-client";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { postDcoCheck, SENTINEL_DCO_CHECK_RUN_NAME } from "./post-dco-check.js";

function makeClient(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return { client: createGitHubClient({ token: "ghp_test", fetch }), calls };
}

describe("postDcoCheck — carries the intent vocabulary through (D5)", () => {
	it("names the check run Platform / Compliance / Run Developer Certificate of Origin", () => {
		expect(SENTINEL_DCO_CHECK_RUN_NAME).toBe("Platform / Compliance / Run Developer Certificate of Origin");
	});
});

describe("postDcoCheck — valid", () => {
	it("posts a success check run naming how many commits passed", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { id: 1, conclusion: "success" } }]);

		const result = await postDcoCheck({
			client,
			repo: "acme/demo",
			headSha: "abc123",
			result: { valid: true, commitCount: 3, violations: [] },
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
		expect(body.name).toBe(SENTINEL_DCO_CHECK_RUN_NAME);
		expect(body.head_sha).toBe("abc123");
		expect(body.output.title).toBe("DCO: OK");
		expect(body.output.summary).toBe("All 3 commit(s) are signed off.");
		const url = new URL(body.details_url);
		expect(url.origin + url.pathname).toBe("https://app.axiom.co/the-holocron-7bbe/query");
		const apl = (JSON.parse(url.searchParams.get("initForm")!) as { apl: string }).apl;
		expect(apl).toContain('runId == "run-1"');
		expect(apl).toContain('msg == "postDcoCheck: posted"');
		expect(body.output.text).toBe("Run ID: `run-1`");
	});
});

describe("postDcoCheck — remediation guidance", () => {
	it("includes only the rebase path, never dcoapp's remediation-commit recipe (lint-dco.ts's own deliberately-NOT-ported call)", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { id: 4, conclusion: "failure" } }]);

		await postDcoCheck({
			client,
			repo: "acme/demo",
			headSha: "abc123",
			result: {
				valid: false,
				commitCount: 2,
				violations: [{ sha: "bad0001deadbeef", author: "Ada Lovelace <ada@example.com>" }],
			},
			runId: "run-4",
			headRef: "feature/my-branch",
		});

		const body = calls[0]?.body as { output: { text: string } };
		expect(body.output.text).toContain("always include `Signed-off-by: Author Name <authoremail@example.com>`");
		expect(body.output.text).toContain("git commit -s");
		expect(body.output.text).toContain("## Rebase the branch");
		expect(body.output.text).toContain("git rebase HEAD~2 --signoff");
		expect(body.output.text).toContain("git push --force-with-lease origin feature/my-branch");
		expect(body.output.text).not.toContain("Remediation Commit");
	});

	it("falls back to a placeholder branch name when headRef is unavailable", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { id: 5, conclusion: "failure" } }]);

		await postDcoCheck({
			client,
			repo: "acme/demo",
			headSha: "abc123",
			result: {
				valid: false,
				commitCount: 1,
				violations: [{ sha: "bad0001", author: "Ada Lovelace <ada@example.com>" }],
			},
			runId: "run-5",
		});

		const body = calls[0]?.body as { output: { text: string } };
		expect(body.output.text).toContain("git push --force-with-lease origin <branch>");
	});
});

describe("postDcoCheck — findings", () => {
	it("posts a failure check run -- DCO is a provenance requirement, always merge-blocking, not severity-based", async () => {
		const { client } = makeClient([{ status: 201, body: { id: 2, conclusion: "failure" } }]);

		const result = await postDcoCheck({
			client,
			repo: "acme/demo",
			headSha: "abc123",
			result: {
				valid: false,
				commitCount: 1,
				violations: [{ sha: "bad0001", author: "Ada Lovelace <ada@example.com>" }],
			},
			runId: "run-2",
		});

		expect(result.conclusion).toBe("failure");
	});

	it("formats each violation as one summary line and includes remediation instructions", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { id: 3, conclusion: "failure" } }]);

		await postDcoCheck({
			client,
			repo: "acme/demo",
			headSha: "abc123",
			result: {
				valid: false,
				commitCount: 2,
				violations: [{ sha: "bad0001deadbeef", author: "Ada Lovelace <ada@example.com>" }],
			},
			runId: "run-3",
		});

		const body = calls[0]?.body as { output: { title: string; summary: string; text: string } };
		expect(body.output.title).toBe("DCO: 1 commit(s) missing a sign-off");
		expect(body.output.summary).toBe("1 of 2 commit(s) are missing a Signed-off-by trailer — see details below.");
		expect(body.output.text).toContain("bad0001: Ada Lovelace <ada@example.com>");
		expect(body.output.text).toContain("git rebase HEAD~2 --signoff");
		expect(body.output.text).toContain("Run ID: `run-3`");
	});
});
