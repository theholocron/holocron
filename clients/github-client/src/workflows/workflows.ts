import type { RestClient } from "../utils.js";
import { repoBase } from "../utils.js";

/** A workflow run as GitHub returns it, with only the fields this client reads. */
export interface GitHubWorkflowRun {
	/** The run's numeric id. */
	id: number;
	/** The workflow's name, or `null` when unnamed. */
	name: string | null;
	/** The run's display title. */
	display_title: string;
	/** The branch the run was triggered on. */
	head_branch: string;
	/** The commit SHA the run was triggered on. */
	head_sha: string;
	/** The run's status, e.g. `queued`, `in_progress` or `completed`. */
	status: string;
	/** The run's result once completed, or `null` before. */
	conclusion: string | null;
	/** The URL of the run's page on GitHub. */
	html_url: string;
	/** When the run was created, as an ISO 8601 timestamp. */
	created_at: string;
	/** When the run was last updated, as an ISO 8601 timestamp. */
	updated_at: string;
}

/** Filters for listing workflow runs. */
export interface WorkflowRunFilter {
	/** Only runs on this branch. */
	branch?: string;
	/** The maximum number of runs to return. */
	limit?: number;
	/** Only runs with this status. */
	status?: string;
}

interface WorkflowRunsResponse {
	total_count: number;
	workflow_runs: GitHubWorkflowRun[];
}

export function workflows(rest: RestClient) {
	return {
		listRuns: (repo: string, filter?: WorkflowRunFilter): Promise<GitHubWorkflowRun[]> => {
			const params = new URLSearchParams();
			if (filter?.branch) params.set("branch", filter.branch);
			if (filter?.limit) params.set("per_page", String(filter.limit));
			if (filter?.status) params.set("status", filter.status);
			const qs = params.toString();
			const path = qs ? `${repoBase(repo)}/actions/runs?${qs}` : `${repoBase(repo)}/actions/runs`;
			return rest.request<WorkflowRunsResponse>(path).then((r: WorkflowRunsResponse) => r.workflow_runs);
		},

		getRun: (repo: string, id: string | number): Promise<GitHubWorkflowRun> =>
			rest.request<GitHubWorkflowRun>(`${repoBase(repo)}/actions/runs/${id}`),

		/**
		 * Triggers a `workflow_dispatch` run. `workflowFile` is the workflow's
		 * filename (e.g. `"platform.dispatchedCheck.yml"`) — GitHub accepts the
		 * filename directly, no numeric workflow ID lookup needed. Fire-and-forget:
		 * the API returns `204` with no run ID, so callers needing to correlate
		 * the resulting run back to this call must pass their own correlation
		 * value through `inputs` (visible in the Actions UI/logs — never a secret).
		 */
		createWorkflowDispatch: (
			repo: string,
			workflowFile: string,
			ref: string,
			inputs?: Record<string, string>
		): Promise<void> =>
			rest.request<void>(`${repoBase(repo)}/actions/workflows/${workflowFile}/dispatches`, {
				method: "POST",
				body: { ref, inputs },
				expectNoContent: true,
			}),
	};
}
