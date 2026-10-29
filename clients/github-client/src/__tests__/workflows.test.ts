import { describe, expect, it } from "vitest";

import { createGitHubClient } from "../index.js";
import { REPO, stubFetch, TOKEN } from "./helpers.js";

const RAW_RUN = {
	id: 1,
	name: "CI",
	display_title: "chore: update deps",
	head_branch: "main",
	head_sha: "abc123",
	status: "completed",
	conclusion: "success",
	html_url: "https://github.com/theholocron/test-repo/actions/runs/1",
	created_at: "2024-01-01T00:00:00Z",
	updated_at: "2024-01-01T01:00:00Z",
};

describe("workflows", () => {
	it("GET /repos/{owner}/{name}/actions/runs — no filter", async () => {
		const { fetch, calls } = stubFetch([{ body: { total_count: 1, workflow_runs: [RAW_RUN] } }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		const result = await client.workflows.listRuns(REPO);
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toContain("/repos/theholocron/test-repo/actions/runs");
		expect(calls[0]?.url).not.toContain("?");
		expect(result).toEqual([RAW_RUN]);
	});

	it("GET /repos/{owner}/{name}/actions/runs — with filter", async () => {
		const { fetch, calls } = stubFetch([{ body: { total_count: 1, workflow_runs: [RAW_RUN] } }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.workflows.listRuns(REPO, {
			branch: "main",
			limit: 10,
			status: "completed",
		});
		expect(calls[0]?.url).toContain("branch=main");
		expect(calls[0]?.url).toContain("per_page=10");
		expect(calls[0]?.url).toContain("status=completed");
	});

	it("GET /repos/{owner}/{name}/actions/runs/{id}", async () => {
		const { fetch, calls } = stubFetch([{ body: RAW_RUN }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		const result = await client.workflows.getRun(REPO, 1);
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toContain("/actions/runs/1");
		expect(result).toEqual(RAW_RUN);
	});

	it("POST /repos/{owner}/{name}/actions/workflows/{file}/dispatches", async () => {
		const { fetch, calls } = stubFetch([{ status: 204 }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		const result = await client.workflows.createWorkflowDispatch(REPO, "platform.dispatchedCheck.yml", "main", {
			repo: "theholocron/other-repo",
			task: "verification.typeSafety",
			check_run_id: "1234",
		});
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toContain(
			"/repos/theholocron/test-repo/actions/workflows/platform.dispatchedCheck.yml/dispatches"
		);
		expect(calls[0]?.body).toEqual({
			ref: "main",
			inputs: {
				repo: "theholocron/other-repo",
				task: "verification.typeSafety",
				check_run_id: "1234",
			},
		});
		expect(result).toBeUndefined();
	});
});
