import type { GitHubClient } from "@theholocron/github-client";
import { describe, expect, it, vi } from "vitest";

import { githubAggregateApi } from "./github-aggregate-api.js";

function fakeClient() {
	return {
		checks: {
			listCheckRunsForRef: vi.fn(async () => [
				{
					id: 1,
					name: "test:unit / Conclusion",
					head_sha: "abc",
					status: "completed",
					conclusion: "success",
					html_url: "https://x/1",
					details_url: "https://x/d1",
					started_at: "2026-11-22T10:00:00Z",
					app: { id: 7, slug: "github-actions" },
				},
				{
					id: 2,
					name: "typecheck / Conclusion",
					head_sha: "abc",
					status: "queued",
					conclusion: null,
					html_url: "https://x/2",
				},
			]),
			createCheckRun: vi.fn(async () => ({ id: 77 })),
			updateCheckRun: vi.fn(async () => ({ id: 77 })),
		},
		statuses: {
			listCommitStatuses: vi.fn(async () => [
				{ id: 9, context: "codecov/patch", state: "success", target_url: "https://c/9", created_at: "t" },
			]),
		},
	};
}

describe("githubAggregateApi", () => {
	it("reads check runs and statuses in the plain shape the aggregate uses", async () => {
		const client = fakeClient();
		const api = githubAggregateApi(client as unknown as GitHubClient, "acme/demo");
		expect(await api.listCheckRuns("abc")).toEqual([
			{
				id: 1,
				name: "test:unit / Conclusion",
				status: "completed",
				conclusion: "success",
				startedAt: "2026-11-22T10:00:00Z",
				url: "https://x/d1",
				appSlug: "github-actions",
			},
			{
				id: 2,
				name: "typecheck / Conclusion",
				status: "queued",
				conclusion: null,
				startedAt: null,
				url: "https://x/2",
				appSlug: null,
			},
		]);
		expect(await api.listCommitStatuses("abc")).toEqual([
			{ context: "codecov/patch", state: "success", url: "https://c/9" },
		]);
		expect(client.checks.listCheckRunsForRef).toHaveBeenCalledWith("acme/demo", "abc");
		expect(client.statuses.listCommitStatuses).toHaveBeenCalledWith("acme/demo", "abc");
	});

	it("creates a check run with its verdict, output and start time, and returns the id", async () => {
		const client = fakeClient();
		const api = githubAggregateApi(client as unknown as GitHubClient, "acme/demo");
		const id = await api.createCheckRun("abc", "ci / Required checks (sentinel)", {
			status: "completed",
			conclusion: "failure",
			title: "t",
			summary: "s",
			text: "details",
			startedAt: "2026-11-22T10:00:00Z",
		});
		expect(id).toBe(77);
		expect(client.checks.createCheckRun).toHaveBeenCalledWith("acme/demo", {
			name: "ci / Required checks (sentinel)",
			head_sha: "abc",
			status: "completed",
			conclusion: "failure",
			output: { title: "t", summary: "s", text: "details" },
			started_at: "2026-11-22T10:00:00Z",
		});
	});

	it("leaves out the verdict, details and start time a write does not carry, on a create and an update", async () => {
		const client = fakeClient();
		const api = githubAggregateApi(client as unknown as GitHubClient, "acme/demo");
		await api.createCheckRun("abc", "n", { status: "in_progress", title: "t", summary: "s", text: "" });
		expect(client.checks.createCheckRun).toHaveBeenCalledWith("acme/demo", {
			name: "n",
			head_sha: "abc",
			status: "in_progress",
			output: { title: "t", summary: "s" },
		});
		await api.updateCheckRun(77, { status: "in_progress", title: "t", summary: "s", text: "" });
		await api.updateCheckRun(77, {
			status: "completed",
			conclusion: "success",
			title: "t",
			summary: "s",
			text: "x",
		});
		expect(client.checks.updateCheckRun).toHaveBeenNthCalledWith(1, "acme/demo", 77, {
			status: "in_progress",
			output: { title: "t", summary: "s" },
		});
		expect(client.checks.updateCheckRun).toHaveBeenNthCalledWith(2, "acme/demo", 77, {
			status: "completed",
			conclusion: "success",
			output: { title: "t", summary: "s", text: "x" },
		});
	});
});
