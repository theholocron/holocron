/**
 * `ci` capability for GitHub — workflow runs only.
 *
 * Reads `/repos/{owner}/{name}/actions/runs[?…]` for `listRuns` and
 * `/repos/{owner}/{name}/actions/runs/{run_id}` for `getRun`.
 * Workflow YAML files themselves live with the `source` capability
 * (see Phase 1 architectural decision).
 */

import type { Ci, CiRun, CiRunFilter, CiRunStatus } from "@theholocron/cli";

import { parseRepo } from "../repo.js";
import type { RestClient } from "@theholocron/cli";

export interface CiOptions {
	repo: string;
}

interface RawRun {
	id: number;
	name: string | null;
	display_title: string;
	head_branch: string;
	head_sha: string;
	status: "queued" | "in_progress" | "completed" | string;
	conclusion: "success" | "failure" | "cancelled" | "skipped" | string | null;
	html_url: string;
	created_at: string;
	updated_at: string;
}

interface RawRunsResponse {
	total_count: number;
	workflow_runs: RawRun[];
}

export class GitHubCi implements Ci {
	readonly key = "ci" as const;
	readonly providerName = "github";

	private readonly base: string;

	constructor(
		private readonly rest: RestClient,
		opts: CiOptions
	) {
		const { owner, name } = parseRepo(opts.repo);
		this.base = `/repos/${owner}/${name}/actions/runs`;
	}

	async listRuns(filter?: CiRunFilter): Promise<CiRun[]> {
		const params = new URLSearchParams();
		if (filter?.branch) params.set("branch", filter.branch);
		if (filter?.limit) params.set("per_page", String(filter.limit));
		// Note: GitHub's `status` query param accepts `queued`/`in_progress`/
		// `completed`/`success`/`failure`/etc. — we forward our enum 1:1.
		if (filter?.status) params.set("status", filter.status);
		const qs = params.toString();
		const path = qs ? `${this.base}?${qs}` : this.base;
		const res = await this.rest.request<RawRunsResponse>(path);
		return res.workflow_runs.map((r) => this.mapRun(r));
	}

	async getRun(id: string | number): Promise<CiRun> {
		const raw = await this.rest.request<RawRun>(`${this.base}/${id}`);
		return this.mapRun(raw);
	}

	/**
	 * GitHub reports run state as `status` plus `conclusion` (the latter
	 * is set once `status === 'completed'`). Holocron's `CiRunStatus`
	 * collapses these onto one axis — when complete, the conclusion is
	 * the meaningful value.
	 */
	private mapRun(raw: RawRun): CiRun {
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
