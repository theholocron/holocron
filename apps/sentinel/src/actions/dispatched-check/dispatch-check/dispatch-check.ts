import {
	SENTINEL_DISPATCH_REF,
	SENTINEL_DISPATCH_REPO,
	SENTINEL_DISPATCH_WORKFLOW_FILE,
} from "../../../utils/index.js";
import type { DispatchCheckInput, DispatchCheckResult } from "./dispatch-check.type.js";

export async function dispatchCheck(input: DispatchCheckInput): Promise<DispatchCheckResult> {
	const { client, repo, headSha, ref, task, checkName } = input;

	const checkRun = await client.checks.createCheckRun(repo, {
		name: checkName,
		head_sha: headSha,
		status: "queued",
	});

	await client.workflows.createWorkflowDispatch(
		SENTINEL_DISPATCH_REPO,
		SENTINEL_DISPATCH_WORKFLOW_FILE,
		SENTINEL_DISPATCH_REF,
		{
			repo,
			ref,
			task,
			"check-run-id": String(checkRun.id),
		}
	);

	return { checkRunId: checkRun.id, htmlUrl: checkRun.html_url };
}
