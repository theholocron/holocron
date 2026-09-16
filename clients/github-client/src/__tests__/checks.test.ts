import { describe, expect, it } from "vitest";

import { createGitHubClient } from "../index.js";
import { REPO, stubFetch, TOKEN } from "./helpers.js";

const RAW_CHECK_RUN = {
	id: 1234,
	name: "Sentinel / Capability Compliance",
	head_sha: "abc123",
	status: "completed" as const,
	conclusion: "success" as const,
	html_url: "https://github.com/theholocron/test-repo/runs/1234",
};

describe("checks.createCheckRun", () => {
	it("POSTs /repos/{owner}/{name}/check-runs", async () => {
		const { fetch, calls } = stubFetch([{ status: 201, body: RAW_CHECK_RUN }]);
		const client = createGitHubClient({ token: TOKEN, fetch });

		const result = await client.checks.createCheckRun(REPO, {
			name: "Sentinel / Capability Compliance",
			head_sha: "abc123",
			status: "completed",
			conclusion: "success",
			output: { title: "Capability compliance: OK", summary: "All required capabilities present." },
		});

		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toContain("/repos/theholocron/test-repo/check-runs");
		expect(calls[0]?.body).toMatchObject({
			name: "Sentinel / Capability Compliance",
			head_sha: "abc123",
			status: "completed",
			conclusion: "success",
			output: { title: "Capability compliance: OK", summary: "All required capabilities present." },
		});
		expect(result.id).toBe(1234);
		expect(result.conclusion).toBe("success");
		expect(result.html_url).toBe("https://github.com/theholocron/test-repo/runs/1234");
	});

	it("omits status/conclusion/output when not given, matching GitHub's own defaults", async () => {
		const { fetch, calls } = stubFetch([
			{ status: 201, body: { ...RAW_CHECK_RUN, status: "queued" as const, conclusion: null } },
		]);
		const client = createGitHubClient({ token: TOKEN, fetch });

		const result = await client.checks.createCheckRun(REPO, { name: "Sentinel", head_sha: "abc123" });

		expect(calls[0]?.body).toEqual({ name: "Sentinel", head_sha: "abc123" });
		expect(result.status).toBe("queued");
		expect(result.conclusion).toBeNull();
	});
});
