import type { Ci, CiRun, CiRunFilter, CiRunStatus } from "@theholocron/cli";
import type { GitHubClient, GitHubWorkflowRun } from "@theholocron/github-client";

export interface CiOptions {
	repo: string;
}

export class GitHubCi implements Ci {
	readonly key = "ci" as const;
	readonly providerName = "github";

	constructor(
		private readonly client: GitHubClient,
		private readonly opts: CiOptions
	) {}

	async listRuns(filter?: CiRunFilter): Promise<CiRun[]> {
		const runs = await this.client.workflows.listRuns(this.opts.repo, {
			branch: filter?.branch,
			limit: filter?.limit,
			status: filter?.status,
		});
		return runs.map((r) => this.mapRun(r));
	}

	async getRun(id: string | number): Promise<CiRun> {
		const raw = await this.client.workflows.getRun(this.opts.repo, id);
		return this.mapRun(raw);
	}

	private mapRun(raw: GitHubWorkflowRun): CiRun {
		const status: CiRunStatus =
			raw.status === "completed" && raw.conclusion
				? this.mapConclusion(raw.conclusion)
				: (raw.status as CiRunStatus);
		return {
			id: raw.id,
			workflowName: raw.name ?? raw.display_title,
			branch: raw.head_branch,
			sha: raw.head_sha,
			status,
			url: raw.html_url,
			startedAt: raw.created_at,
			...(raw.status === "completed" ? { completedAt: raw.updated_at } : {}),
		};
	}

	private mapConclusion(conclusion: string): CiRunStatus {
		switch (conclusion) {
			case "success":
			case "failure":
			case "cancelled":
			case "skipped":
				return conclusion;
			default:
				return "completed";
		}
	}
}
