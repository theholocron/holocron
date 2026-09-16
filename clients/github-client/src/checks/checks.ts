import type { RestClient } from "../utils.js";
import { repoBase } from "../utils.js";

export type CheckRunStatus = "queued" | "in_progress" | "completed";

export type CheckRunConclusion =
	"success" | "failure" | "neutral" | "cancelled" | "timed_out" | "action_required" | "skipped";

export interface CheckRunOutput {
	title: string;
	summary: string;
	text?: string;
}

export interface CreateCheckRunInput {
	name: string;
	/** The commit SHA the check run attaches to. */
	head_sha: string;
	/** Defaults to `"queued"` (GitHub's own default) when omitted. */
	status?: CheckRunStatus;
	/** Required when `status` is `"completed"`. */
	conclusion?: CheckRunConclusion;
	output?: CheckRunOutput;
}

export interface GitHubCheckRun {
	id: number;
	name: string;
	head_sha: string;
	status: CheckRunStatus;
	conclusion: CheckRunConclusion | null;
	html_url: string;
}

export function checks(rest: RestClient) {
	return {
		createCheckRun: (repo: string, input: CreateCheckRunInput): Promise<GitHubCheckRun> =>
			rest.request<GitHubCheckRun>(`${repoBase(repo)}/check-runs`, {
				method: "POST",
				body: input,
			}),
	};
}
