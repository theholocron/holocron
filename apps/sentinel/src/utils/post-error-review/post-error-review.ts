import type { GitHubPullRequestReview } from "@theholocron/github-client";

import { outsideDiffDigest } from "./outside-diff-digest/index.js";
import type { PostErrorReviewInput } from "./post-error-review.type.js";

/**
 * The GitHub App's own bot account login — every review this posts is
 * authored here. Confirmed live (holocron#860's own test PR, #871): a
 * `Bot` actor's `login` here has no `[bot]` suffix, unlike a comment
 * author's `login` elsewhere in this org's tooling -- don't assume the
 * two match without checking again if this ever needs re-deriving.
 */
export const SENTINEL_BOT_LOGIN = "the-holocron-sentinel";

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

function marker(checkKey: string): string {
	return `<!-- sentinel:${checkKey} -->`;
}

function markedBody(checkKey: string, body: string): string {
	return `${marker(checkKey)}\n${body}`;
}

/** In the body of a review that lists the findings outside the diff: which list it was (see {@link outsideDiffDigest}). */
function outsideMarkerPrefix(checkKey: string): string {
	return `<!-- sentinel:${checkKey}:outside:`;
}

/** The digest in the newest review of this check that listed findings outside the diff, or `undefined` when none did. */
function lastOutsideDigest(reviews: GitHubPullRequestReview[], checkKey: string): string | undefined {
	const prefix = outsideMarkerPrefix(checkKey);
	for (const review of [...reviews].reverse()) {
		const start = review.body?.indexOf(prefix) ?? -1;
		if (start === -1) continue;
		const from = start + prefix.length;
		return review.body!.slice(from, review.body!.indexOf(" -->", from));
	}
	return undefined;
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

	// Post only what is new (holocron#1950). A finding that already has an open thread of this check with the same
	// text at the same place is on the pull request: it is not posted again, wherever the diff has moved since.
	const open = new Set(
		threads.filter((t) => !t.isResolved && t.body?.startsWith(prefix)).map((t) => `${t.path}:${t.line}:${t.body}`)
	);
	const unposted = errors.filter((e) => !open.has(`${e.file}:${e.line}:${markedBody(checkKey, e.body)}`));
	if (unposted.length === 0) return;

	const files = await client.pulls.listFiles(repo, pullNumber);
	const commentable = new Map(files.map((f) => [f.filename, commentableLines(f.patch)]));
	const freshInline = unposted.filter((e) => commentable.get(e.file)?.has(e.line));
	const outsideDiff = unposted.filter((e) => !commentable.get(e.file)?.has(e.line));

	// Findings outside the diff live only in a review's body, so a run lists them again only when the list is not the
	// one the newest review of this check gave (its digest, kept in the body).
	const digest = outsideDiffDigest(outsideDiff);
	const outsideChanged =
		outsideDiff.length > 0 &&
		lastOutsideDigest(await client.pulls.listReviews(repo, pullNumber), checkKey) !== digest;
	if (freshInline.length === 0 && !outsideChanged) return;

	const summary = [
		freshInline.length > 0
			? `${errors.length} error(s) found by ${checkLabel} — see inline comments below.`
			: `${errors.length} error(s) found by ${checkLabel}.`,
		outsideChanged
			? [
					`${outsideMarkerPrefix(checkKey)}${digest} -->`,
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
		comments: freshInline.map((e) => ({
			path: e.file,
			line: e.line,
			side: "RIGHT" as const,
			body: markedBody(checkKey, e.body),
		})),
	});
}
