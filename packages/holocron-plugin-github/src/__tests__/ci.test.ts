import { describe, expect, it } from "vitest";

import { GitHubCi } from "../capabilities/ci.js";
import { createGitHubClient } from "../rest.js";

import { stubFetch } from "./helpers.js";

const REPO = "theholocron/holocron";

function makeCi(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	const rest = createGitHubClient({ token: "pat", fetch });
	const ci = new GitHubCi(rest, { repo: REPO });
	return { ci, calls };
}

function makeRun(
	overrides: Partial<{
		id: number;
		name: string | null;
		display_title: string;
		head_branch: string;
		head_sha: string;
		status: string;
		conclusion: string | null;
		html_url: string;
		created_at: string;
		updated_at: string;
	}> = {}
) {
	return {
		id: 1,
		name: "unit-tests",
		display_title: "Run unit-tests",
		head_branch: "main",
		head_sha: "abc123",
		status: "completed",
		conclusion: "success",
		html_url: "https://github.com/x/y/actions/runs/1",
		created_at: "2026-06-29T00:00:00Z",
		updated_at: "2026-06-29T00:01:00Z",
		...overrides,
	};
}

describe("GitHubCi.listRuns", () => {
	it("GETs /repos/{repo}/actions/runs with no params when filter omitted", async () => {
		const { ci, calls } = makeCi([{ status: 200, body: { total_count: 0, workflow_runs: [] } }]);
		await ci.listRuns();
		expect(calls[0]?.url).toBe(`https://api.github.com/repos/${REPO}/actions/runs`);
	});

	it("forwards branch + status + limit as query params", async () => {
		const { ci, calls } = makeCi([{ status: 200, body: { total_count: 0, workflow_runs: [] } }]);
		await ci.listRuns({ branch: "main", status: "failure", limit: 5 });
		expect(calls[0]?.url).toBe(
			`https://api.github.com/repos/${REPO}/actions/runs?branch=main&per_page=5&status=failure`
		);
	});

	it("collapses status + conclusion onto a single CiRunStatus", async () => {
		const { ci } = makeCi([
			{
				status: 200,
				body: {
					total_count: 3,
					workflow_runs: [
						makeRun({ id: 1, status: "completed", conclusion: "success" }),
						makeRun({ id: 2, status: "completed", conclusion: "failure" }),
						makeRun({ id: 3, status: "in_progress", conclusion: null }),
					],
				},
			},
		]);
		const runs = await ci.listRuns();
		expect(runs.map((r) => r.status)).toEqual(["success", "failure", "in_progress"]);
	});

	it("falls back to display_title when name is null", async () => {
		const { ci } = makeCi([
			{
				status: 200,
				body: {
					total_count: 1,
					workflow_runs: [makeRun({ name: null, display_title: "Fix typo (#283)" })],
				},
			},
		]);
		const [run] = await ci.listRuns();
		expect(run?.workflowName).toBe("Fix typo (#283)");
	});

	it("omits completedAt for runs that are still in progress", async () => {
		const { ci } = makeCi([
			{
				status: 200,
				body: {
					total_count: 1,
					workflow_runs: [makeRun({ status: "in_progress", conclusion: null })],
				},
			},
		]);
		const [run] = await ci.listRuns();
		expect(run?.completedAt).toBeUndefined();
	});
});

describe("GitHubCi.getRun", () => {
	it("GETs /actions/runs/{id} and maps the response", async () => {
		const { ci, calls } = makeCi([{ status: 200, body: makeRun({ id: 42, head_branch: "feat" }) }]);
		const run = await ci.getRun(42);
		expect(calls[0]?.url).toBe(`https://api.github.com/repos/${REPO}/actions/runs/42`);
		expect(run).toMatchObject({ id: 42, branch: "feat", status: "success" });
	});

	it('handles unrecognized conclusions by falling back to "completed"', async () => {
		const { ci } = makeCi([{ status: 200, body: makeRun({ status: "completed", conclusion: "neutral" }) }]);
		const run = await ci.getRun(1);
		expect(run.status).toBe("completed");
	});
});
