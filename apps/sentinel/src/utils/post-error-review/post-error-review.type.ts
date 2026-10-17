import type { GitHubClient } from "@theholocron/github-client";

/** One error-severity finding, already formatted into its own review-comment body. */
export interface ReviewFinding {
	/** File path relative to the repo root. */
	file: string;
	/** 1-indexed — GitHub anchors a review comment to a line, not a column. */
	line: number;
	/** The finding's own rendered text, e.g. `` `rule-id` (line 12, col 7): reason ``. Not yet check-scoped — {@link postErrorReview} adds its own marker on top. */
	body: string;
}

export interface PostErrorReviewInput {
	client: Pick<GitHubClient, "pulls">;
	/** `"owner/repo"`. */
	repo: string;
	pullNumber: number;
	/** The PR's own head SHA the review attaches to. */
	headSha: string;
	/**
	 * Distinguishes this check's own posted threads from a sibling check's
	 * (e.g. `"static-analysis"` vs `"markdown-lint"`) — embedded as an
	 * invisible marker in every comment this posts, so a re-push only ever
	 * resolves this same check's own prior threads.
	 */
	checkKey: string;
	/** e.g. `"static analysis"` / `"markdown lint"` — used in the top-level review body's own wording. */
	checkLabel: string;
	/** e.g. `SENTINEL_STATIC_ANALYSIS_CHECK_RUN_NAME` — named in the "see the X check run" sentence when warnings also exist. */
	checkRunName: string;
	errors: ReviewFinding[];
	warningCount: number;
}
