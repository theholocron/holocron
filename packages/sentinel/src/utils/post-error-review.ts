/**
 * Posts error-severity findings as a PR review instead of (only) a check-run
 * annotation (holocron#860, `.notes/tech-sentinel-review-comments.spec.md`)
 * — shared, identical mechanism for both eslint and markdownlint, the two
 * Bucket 1 checks with a real per-finding severity axis to split on.
 *
 * `event: "COMMENT"` only, never `REQUEST_CHANGES`/`APPROVE` — advisory,
 * same stance as the check run's own `conclusion: "neutral"`. A PR with no
 * error-severity findings gets no review posted at all; warnings stay
 * exactly where they already are, in `output.annotations`.
 *
 * **Re-push behaviour**: this org has `required_review_thread_resolution:
 * true` live on every main repo, so a stale review thread Sentinel itself
 * posted for an error that's since been fixed would otherwise block every
 * future merge on that PR until a human manually resolves it — something
 * nobody would think to do for a bot's own comment. Before posting a fresh
 * review, this resolves every one of Sentinel's own still-open threads for
 * *this same check* whose finding no longer appears in the current push's
 * error list. A still-current error's thread is deliberately left alone;
 * resolving it too would suppress a real, unaddressed finding at next
 * glance for no reason (the check run's own annotations already stopped
 * covering it).
 *
 * Distinguishing "this check's own thread" from a sibling check's (eslint's
 * calls must never touch a markdownlint thread, and vice versa) needs more
 * than `authorLogin` — both post as the same bot. `checkKey` is embedded as
 * a leading HTML comment in every posted comment body (invisible once
 * GitHub renders the markdown) and used both ways: written when posting,
 * matched when deciding what a re-push may resolve.
 */

import type { GitHubClient } from "@theholocron/github-client";

/**
 * The GitHub App's own bot account login — every review this posts is
 * authored here. Confirmed live (holocron#860's own test PR, #871): a
 * `Bot` actor's `login` here has no `[bot]` suffix, unlike a comment
 * author's `login` elsewhere in this org's tooling -- don't assume the
 * two match without checking again if this ever needs re-deriving.
 */
export const SENTINEL_BOT_LOGIN = "the-holocron-sentinel";

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

function marker(checkKey: string): string {
	return `<!-- sentinel:${checkKey} -->`;
}

function markedBody(checkKey: string, body: string): string {
	return `${marker(checkKey)}\n${body}`;
}

export async function postErrorReview(input: PostErrorReviewInput): Promise<void> {
	const { client, repo, pullNumber, headSha, checkKey, checkLabel, checkRunName, errors, warningCount } = input;
	const prefix = marker(checkKey);
	const currentBodies = new Set(errors.map((e) => markedBody(checkKey, e.body)));

	const threads = await client.pulls.listReviewThreads(repo, pullNumber);
	const staleThreads = threads.filter(
		(t) =>
			!t.isResolved &&
			t.authorLogin === SENTINEL_BOT_LOGIN &&
			t.body?.startsWith(prefix) &&
			!currentBodies.has(t.body)
	);
	await Promise.all(staleThreads.map((t) => client.pulls.resolveReviewThread(t.id)));

	if (errors.length === 0) return;

	const summary = [
		`${errors.length} error(s) found by ${checkLabel} — see inline comments below.`,
		warningCount > 0
			? `${warningCount} warning(s) also found; see the ${checkRunName} check run for the full list.`
			: undefined,
	]
		.filter((line): line is string => line !== undefined)
		.join("\n");

	await client.pulls.createReview(repo, pullNumber, {
		commit_id: headSha,
		event: "COMMENT",
		body: summary,
		comments: errors.map((e) => ({
			path: e.file,
			line: e.line,
			side: "RIGHT" as const,
			body: markedBody(checkKey, e.body),
		})),
	});
}
