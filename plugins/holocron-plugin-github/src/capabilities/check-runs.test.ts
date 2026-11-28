import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { createGitHubClient } from "../rest.js";
import { GitHubSource } from "./source.js";

const REPO = "theholocron/holocron";

function makeSource(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	const source = new GitHubSource(createGitHubClient({ token: "pat", fetch }), {
		repo: REPO,
		repoRoot: process.cwd(),
	});
	return { source, calls };
}

const RAW_RUN = {
	id: 7,
	name: "test:unit / Conclusion",
	head_sha: "abc",
	status: "completed",
	conclusion: "success",
	html_url: "https://x/runs/7",
	details_url: "https://x/details/7",
	started_at: "2026-11-22T10:01:00Z",
};

describe("GitHubSource check runs", () => {
	it("lists a commit's check runs in the plain shape, preferring the details link", async () => {
		const { source, calls } = makeSource([
			{
				status: 200,
				body: {
					check_runs: [
						RAW_RUN,
						{
							...RAW_RUN,
							id: 8,
							details_url: null,
							started_at: undefined,
							app: { id: 15368, slug: "github-actions" },
						},
					],
				},
			},
		]);
		const runs = await source.listCheckRuns("abc");
		expect(calls[0]?.url).toContain("/repos/theholocron/holocron/commits/abc/check-runs");
		expect(runs).toEqual([
			{
				id: 7,
				name: "test:unit / Conclusion",
				status: "completed",
				conclusion: "success",
				startedAt: "2026-11-22T10:01:00Z",
				url: "https://x/details/7",
				appSlug: null,
			},
			{
				id: 8,
				name: "test:unit / Conclusion",
				status: "completed",
				conclusion: "success",
				startedAt: null,
				url: "https://x/runs/7",
				appSlug: "github-actions",
			},
		]);
	});

	it("lists a commit's statuses and accepts a repo override", async () => {
		const { source, calls } = makeSource([
			{
				status: 200,
				body: [
					{ id: 1, context: "codecov/patch", state: "success", target_url: "https://c/1", created_at: "t" },
				],
			},
		]);
		expect(await source.listCommitStatuses("abc", "theholocron/clients")).toEqual([
			{ context: "codecov/patch", state: "success", url: "https://c/1" },
		]);
		expect(calls[0]?.url).toContain("/repos/theholocron/clients/commits/abc/statuses");
	});

	it("reads the default repo's statuses and check runs, and patches a run in another repo", async () => {
		const { source, calls } = makeSource([
			{ status: 200, body: [] },
			{ status: 200, body: { check_runs: [] } },
			{ status: 200, body: RAW_RUN },
		]);
		expect(await source.listCommitStatuses("abc")).toEqual([]);
		expect(await source.listCheckRuns("abc", "theholocron/clients")).toEqual([]);
		await source.updateCheckRun(
			7,
			{ status: "in_progress", title: "t", summary: "s", text: "" },
			"theholocron/clients"
		);
		expect(calls[0]?.url).toContain("/repos/theholocron/holocron/commits/abc/statuses");
		expect(calls[1]?.url).toContain("/repos/theholocron/clients/commits/abc/check-runs");
		expect(calls[2]?.url).toContain("/repos/theholocron/clients/check-runs/7");
	});

	it("creates a completed check run with its verdict, output and start time", async () => {
		const { source, calls } = makeSource([{ status: 201, body: { ...RAW_RUN, id: 99 } }]);
		const id = await source.createCheckRun(
			"abc",
			"ci / Required checks",
			{
				status: "completed",
				conclusion: "failure",
				title: "t",
				summary: "s",
				text: "details",
				startedAt: "2026-11-22T10:00:00Z",
			},
			"theholocron/other"
		);
		expect(id).toBe(99);
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toContain("/repos/theholocron/other/check-runs");
		expect(calls[0]?.body).toEqual({
			name: "ci / Required checks",
			head_sha: "abc",
			status: "completed",
			conclusion: "failure",
			output: { title: "t", summary: "s", text: "details" },
			started_at: "2026-11-22T10:00:00Z",
		});
	});

	it("leaves out the conclusion, details and start time a write does not carry", async () => {
		const { source, calls } = makeSource([{ status: 201, body: { ...RAW_RUN, id: 5 } }]);
		await source.createCheckRun("abc", "ci / Required checks", {
			status: "in_progress",
			title: "t",
			summary: "s",
			text: "",
		});
		expect(calls[0]?.body).toEqual({
			name: "ci / Required checks",
			head_sha: "abc",
			status: "in_progress",
			output: { title: "t", summary: "s" },
		});
	});

	it("patches a check run's state, verdict and output", async () => {
		const { source, calls } = makeSource([
			{ status: 200, body: RAW_RUN },
			{ status: 200, body: RAW_RUN },
		]);
		await source.updateCheckRun(7, {
			status: "completed",
			conclusion: "success",
			title: "t",
			summary: "s",
			text: "",
		});
		await source.updateCheckRun(7, { status: "in_progress", title: "t", summary: "s", text: "x" });
		expect(calls[0]?.method).toBe("PATCH");
		expect(calls[0]?.url).toContain("/repos/theholocron/holocron/check-runs/7");
		expect(calls[0]?.body).toEqual({
			status: "completed",
			conclusion: "success",
			output: { title: "t", summary: "s" },
		});
		expect(calls[1]?.body).toEqual({ status: "in_progress", output: { title: "t", summary: "s", text: "x" } });
	});
});
