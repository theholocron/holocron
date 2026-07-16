import type { RestClient } from "../utils.js";
import { repoBase } from "../utils.js";

export interface GitHubWorkflowRun {
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
}

export interface WorkflowRunFilter {
	branch?: string;
	limit?: number;
	status?: string;
}

interface WorkflowRunsResponse {
	total_count: number;
	workflow_runs: GitHubWorkflowRun[];
}

export function workflows(rest: RestClient) {
	return {
		listRuns: (
			repo: string,
			filter?: WorkflowRunFilter,
		): Promise<GitHubWorkflowRun[]> => {
			const params = new URLSearchParams();
			if (filter?.branch) params.set("branch", filter.branch);
			if (filter?.limit) params.set("per_page", String(filter.limit));
			if (filter?.status) params.set("status", filter.status);
			const qs = params.toString();
			const path = qs
				? `${repoBase(repo)}/actions/runs?${qs}`
				: `${repoBase(repo)}/actions/runs`;
			return rest
				.request<WorkflowRunsResponse>(path)
				.then((r: WorkflowRunsResponse) => r.workflow_runs);
		},

		getRun: (
			repo: string,
			id: string | number,
		): Promise<GitHubWorkflowRun> =>
			rest.request<GitHubWorkflowRun>(
				`${repoBase(repo)}/actions/runs/${id}`,
			),
	};
}
