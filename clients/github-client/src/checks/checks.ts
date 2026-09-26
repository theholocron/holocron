import type { RestClient } from "../utils.js";
import { repoBase } from "../utils.js";

export type CheckRunStatus = "queued" | "in_progress" | "completed";

export type CheckRunConclusion =
	"success" | "failure" | "neutral" | "cancelled" | "timed_out" | "action_required" | "skipped";

export type CheckRunAnnotationLevel = "notice" | "warning" | "failure";

export interface CheckRunAnnotation {
	/** File path relative to the repo root. */
	path: string;
	/** 1-indexed. */
	start_line: number;
	end_line: number;
	/** Only valid when `start_line === end_line`. */
	start_column?: number;
	end_column?: number;
	annotation_level: CheckRunAnnotationLevel;
	/** Max 64KB. */
	message: string;
	/** Max 255 characters. */
	title?: string;
	/** Max 64KB. */
	raw_details?: string;
}

export interface CheckRunOutput {
	title: string;
	summary: string;
	text?: string;
	/**
	 * Inline PR annotations — up to 50 per request. Sending more requires a
	 * follow-up `updateCheckRun()` PATCH per GitHub's own docs; this client
	 * doesn't paginate them for you.
	 */
	annotations?: CheckRunAnnotation[];
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
	/** URL for the "Details" link on the check run. GitHub defaults to the check suite's own summary page when omitted. */
	details_url?: string;
}

export interface GitHubCheckRun {
	id: number;
	name: string;
	head_sha: string;
	status: CheckRunStatus;
	conclusion: CheckRunConclusion | null;
	html_url: string;
}

export interface UpdateCheckRunInput {
	status?: CheckRunStatus;
	/** Required when `status` is `"completed"`. */
	conclusion?: CheckRunConclusion;
	output?: CheckRunOutput;
	/** URL for the "Details" link on the check run. */
	details_url?: string;
}

export function checks(rest: RestClient) {
	return {
		createCheckRun: (repo: string, input: CreateCheckRunInput): Promise<GitHubCheckRun> =>
			rest.request<GitHubCheckRun>(`${repoBase(repo)}/check-runs`, {
				method: "POST",
				body: input,
			}),

		/** Patches an existing check run — used to move a `"queued"` run posted before a dispatched task ran to `"completed"` once it finishes. */
		updateCheckRun: (repo: string, checkRunId: number, input: UpdateCheckRunInput): Promise<GitHubCheckRun> =>
			rest.request<GitHubCheckRun>(`${repoBase(repo)}/check-runs/${checkRunId}`, {
				method: "PATCH",
				body: input,
			}),
	};
}
