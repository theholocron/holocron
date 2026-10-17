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

	const files = await client.pulls.listFiles(repo, pullNumber);
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
