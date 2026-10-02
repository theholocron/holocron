/**
 * Posts error-severity findings as a PR review instead of (only) a check-run
 * annotation (holocron#860, `.notes/tech-sentinel-review-comments.spec.md`)
 * — shared, identical mechanism for eslint, markdownlint and actionlint, the
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
 * **Diff-scoped inline comments** (holocron#906): GitHub only accepts a
 * review comment on a line that's part of the PR's own diff, and rejects
 * the *whole* review (422) if any one comment isn't. A finding on an
 * unchanged line of a changed file is routine (actionlint reports a
 * `needs:` mistake at the job key; a rule can flag an untouched line next
 * to the edit), so errors are split against each file's own `patch` hunks
 * ({@link commentableLines}): in-diff errors stay inline, the rest are
 * listed in the review body by `file:line` — still one review, never
 * silently dropped.
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

/**
 * RIGHT-side line numbers a review comment can anchor to in one file's
 * unified-diff `patch` — every context (` `) and added (`+`) line inside a
 * hunk, never a removed (`-`) one. Empty for a missing patch (GitHub omits
 * it for binary files and very large diffs), which correctly routes every
 * finding in that file to the review body instead.
 */
export function commentableLines(patch: string | undefined): Set<number> {
	const lines = new Set<number>();
	if (!patch) return lines;
	let right: number | undefined;
	for (const line of patch.split("\n")) {
		const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
		if (hunk) {
			right = Number(hunk[1]);
			continue;
		}
		if (right === undefined) continue;
		if (line.startsWith("+") || line.startsWith(" ")) {
			lines.add(right);
			right++;
		}
		// "-" lines exist only on the LEFT side; "\ No newline at end of file" is metadata.
	}
	return lines;
}

/**
 * `GET /pulls/{n}/files` returns each file's `patch` at runtime, but
 * `@theholocron/github-client`'s `GitHubPullRequestFile` doesn't declare it
 * yet — widened locally until it does (holocron#906).
 */
type FileWithPatch = { filename: string; patch?: string };

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

	const files = (await client.pulls.listFiles(repo, pullNumber)) as FileWithPatch[];
	const commentable = new Map(files.map((f) => [f.filename, commentableLines(f.patch)]));
	const inline = errors.filter((e) => commentable.get(e.file)?.has(e.line));
	const outsideDiff = errors.filter((e) => !commentable.get(e.file)?.has(e.line));

	const summary = [
		inline.length > 0
			? `${errors.length} error(s) found by ${checkLabel} — see inline comments below.`
			: `${errors.length} error(s) found by ${checkLabel}.`,
		outsideDiff.length > 0
			? [
					`${outsideDiff.length} of them on line(s) outside this PR's diff, so they can't be inline comments:`,
					...outsideDiff.map((e) => `- \`${e.file}:${e.line}\` — ${e.body}`),
				].join("\n")
			: undefined,
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
		comments: inline.map((e) => ({
			path: e.file,
			line: e.line,
			side: "RIGHT" as const,
			body: markedBody(checkKey, e.body),
		})),
	});
}
