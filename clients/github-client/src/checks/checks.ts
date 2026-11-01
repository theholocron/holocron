import type { RestClient } from "../utils.js";
import { repoBase } from "../utils.js";

/** The lifecycle state of a check run. */
export type CheckRunStatus = "queued" | "in_progress" | "completed";

/** The final result of a completed check run. */
export type CheckRunConclusion =
	"success" | "failure" | "neutral" | "cancelled" | "timed_out" | "action_required" | "skipped";

/** The severity of a check run annotation. */
export type CheckRunAnnotationLevel = "notice" | "warning" | "failure";

/**
 * GitHub's cap on `output.annotations` per `createCheckRun()` /
 * `updateCheckRun()` request. More than this needs a follow-up
 * `updateCheckRun()` PATCH per GitHub's own docs, which this client doesn't
 * do for you; slice with it rather than hardcoding the number.
 */
export const MAX_CHECK_RUN_ANNOTATIONS = 50;

/** One inline annotation attached to a check run's output, anchored to a file and line range. */
export interface CheckRunAnnotation {
	/** File path relative to the repo root. */
	path: string;
	/** 1-indexed. */
	start_line: number;
	/** 1-indexed last line of the annotated range. */
	end_line: number;
	/** Only valid when `start_line === end_line`. */
	start_column?: number;
	/** Column of the end of the range; only valid when `start_line === end_line`. */
	end_column?: number;
	/** Severity of the annotation. */
	annotation_level: CheckRunAnnotationLevel;
	/** Max 64KB. */
	message: string;
	/** Max 255 characters. */
	title?: string;
	/** Max 64KB. */
	raw_details?: string;
}

/** The title, summary and optional annotations shown on a check run. */
export interface CheckRunOutput {
	/** The output's title. */
	title: string;
	/** The output's summary, rendered as Markdown. */
	summary: string;
	/** Longer details text, rendered as Markdown. */
	text?: string;
	/**
	 * Inline PR annotations — up to {@link MAX_CHECK_RUN_ANNOTATIONS} per
	 * request. Sending more requires a follow-up `updateCheckRun()` PATCH per
	 * GitHub's own docs; this client doesn't paginate them for you.
	 */
	annotations?: CheckRunAnnotation[];
}

/** The body of a `createCheckRun()` request. */
export interface CreateCheckRunInput {
	/** The check run's name, as shown in the checks list. */
	name: string;
	/** The commit SHA the check run attaches to. */
	head_sha: string;
	/** Defaults to `"queued"` (GitHub's own default) when omitted. */
	status?: CheckRunStatus;
	/** Required when `status` is `"completed"`. */
	conclusion?: CheckRunConclusion;
	/** The title, summary and annotations to show on the check run. */
	output?: CheckRunOutput;
	/** URL for the "Details" link on the check run. GitHub defaults to the check suite's own summary page when omitted. */
	details_url?: string;
}

/** A check run as GitHub returns it, with only the fields this client reads. */
export interface GitHubCheckRun {
	/** The check run's numeric id. */
	id: number;
	/** The check run's name. */
	name: string;
	/** The commit SHA the check run is attached to. */
	head_sha: string;
	/** The check run's current lifecycle state. */
	status: CheckRunStatus;
	/** The check run's result, or `null` until it is completed. */
	conclusion: CheckRunConclusion | null;
	/** The URL of the check run's page on GitHub. */
	html_url: string;
}

/** The body of an `updateCheckRun()` request; every field is optional. */
export interface UpdateCheckRunInput {
	/** The lifecycle state to move the check run to. */
	status?: CheckRunStatus;
	/** Required when `status` is `"completed"`. */
	conclusion?: CheckRunConclusion;
	/** The title, summary and annotations to set on the check run. */
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
