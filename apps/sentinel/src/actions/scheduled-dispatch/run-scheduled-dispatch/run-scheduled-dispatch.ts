import { errorMessage } from "@theholocron/misc-utils";

import type { RunScheduledDispatchInput, RunScheduledDispatchResult } from "../scheduled-dispatch.type.js";
import { SCHEDULED_TASKS } from "../scheduled-tasks/index.js";

/**
 * Asks GitHub to run a task's workflow (`workflow_dispatch`) on the repository's default branch. A dispatch answers `204`
 * with no run id, so `ok` means GitHub accepted the request, not that a run has started. The workflow's own `concurrency`
 * group keeps overlapping calls from running twice. Never throws.
 */
export async function runScheduledDispatch(input: RunScheduledDispatchInput): Promise<RunScheduledDispatchResult> {
	const { client, repo, task } = input;
	const known = Object.hasOwn(SCHEDULED_TASKS, task) ? SCHEDULED_TASKS[task] : undefined;
	if (!known) return { status: "unknown", reason: `no scheduled task "${task}"` };
	try {
		const ref = (await client.repos.getRepo(repo)).default_branch;
		await client.workflows.createWorkflowDispatch(repo, known.workflow, ref);
		return { status: "ok", workflow: known.workflow, ref };
	} catch (err) {
		return { status: "fail", reason: errorMessage(err) };
	}
}
