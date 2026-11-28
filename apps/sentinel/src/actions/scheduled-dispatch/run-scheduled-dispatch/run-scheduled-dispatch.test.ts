import { describe, expect, it, vi } from "vitest";

import { runScheduledDispatch } from "./run-scheduled-dispatch.js";

function setup(over: { getRepo?: () => Promise<{ default_branch: string }>; dispatch?: () => Promise<void> } = {}) {
	const getRepo = vi.fn(over.getRepo ?? (async () => ({ default_branch: "alpha" })));
	const createWorkflowDispatch = vi.fn(over.dispatch ?? (async () => undefined));
	const client = { repos: { getRepo }, workflows: { createWorkflowDispatch } } as never;
	return { client, getRepo, createWorkflowDispatch };
}

describe("runScheduledDispatch", () => {
	it("dispatches the task's workflow on the repository's default branch", async () => {
		const { client, getRepo, createWorkflowDispatch } = setup();
		const result = await runScheduledDispatch({ client, repo: "o/r", task: "sync-incidents" });
		expect(result).toEqual({ status: "ok", workflow: "ci.sync-incidents.yml", ref: "alpha" });
		expect(getRepo).toHaveBeenCalledWith("o/r");
		expect(createWorkflowDispatch).toHaveBeenCalledWith("o/r", "ci.sync-incidents.yml", "alpha");
	});

	it("says a task the table does not hold is unknown, and writes nothing", async () => {
		const { client, createWorkflowDispatch } = setup();
		for (const task of ["nope", "toString", "__proto__"]) {
			const result = await runScheduledDispatch({ client, repo: "o/r", task });
			expect(result).toEqual({ status: "unknown", reason: `no scheduled task "${task}"` });
		}
		expect(createWorkflowDispatch).not.toHaveBeenCalled();
	});

	it("reports a failed repository read or a refused dispatch, and never throws", async () => {
		const unreadable = setup({
			getRepo: async () => {
				throw new Error("repo gone");
			},
		});
		expect(await runScheduledDispatch({ client: unreadable.client, repo: "o/r", task: "sync-incidents" })).toEqual({
			status: "fail",
			reason: "repo gone",
		});
		const refused = setup({
			dispatch: async () => {
				throw new Error("Resource not accessible by integration");
			},
		});
		const result = await runScheduledDispatch({ client: refused.client, repo: "o/r", task: "sync-incidents" });
		expect(result).toEqual({ status: "fail", reason: "Resource not accessible by integration" });
	});
});
