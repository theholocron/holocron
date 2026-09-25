import { createGitHubClient } from "@theholocron/github-client";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { dispatchCheck } from "./dispatch-check.js";

function makeClient(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return { client: createGitHubClient({ token: "ghp_test", fetch }), calls };
}

describe("dispatchCheck", () => {
	it("posts a queued check run on the target repo, then dispatches the shared .github workflow", async () => {
		const { client, calls } = makeClient([
			{ status: 201, body: { id: 42, html_url: "https://github.com/acme/demo/runs/42" } },
			{ status: 204 },
		]);

		const result = await dispatchCheck({
			client,
			repo: "acme/demo",
			headSha: "abc123",
			ref: "abc123",
			task: "verification.typeSafety",
			checkName: "Verification / Type Safety / Run tsc --noEmit",
		});

		expect(result).toEqual({ checkRunId: 42, htmlUrl: "https://github.com/acme/demo/runs/42" });

		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toContain("/repos/acme/demo/check-runs");
		expect(calls[0]?.body).toMatchObject({
			name: "Verification / Type Safety / Run tsc --noEmit",
			head_sha: "abc123",
			status: "queued",
		});

		expect(calls[1]?.method).toBe("POST");
		expect(calls[1]?.url).toContain(
			"/repos/theholocron/.github/actions/workflows/platform.dispatchedCheck.yml/dispatches"
		);
		expect(calls[1]?.body).toEqual({
			ref: "main",
			inputs: {
				repo: "acme/demo",
				ref: "abc123",
				task: "verification.typeSafety",
				"check-run-id": "42",
			},
		});
	});

	it("passes the created check run's own id as the dispatch's correlation token — no separate id generated", async () => {
		const { client, calls } = makeClient([{ status: 201, body: { id: 9001 } }, { status: 204 }]);

		await dispatchCheck({
			client,
			repo: "acme/other",
			headSha: "def456",
			ref: "feature/x",
			task: "verification.unitTests",
			checkName: "Verification / Unit Tests / Run vitest",
		});

		const dispatchBody = calls[1]?.body as { inputs: Record<string, string> };
		expect(dispatchBody.inputs["check-run-id"]).toBe("9001");
		expect(dispatchBody.inputs.repo).toBe("acme/other");
		expect(dispatchBody.inputs.ref).toBe("feature/x");
	});
});
