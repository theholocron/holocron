/**
 * Generic Git Data API commit primitive: one atomic commit across N files
 * pushed directly onto an existing branch (holocron#820). Shared by every
 * Sentinel auto-fix-commit action — formatting (prettier) today, more to
 * follow (e.g. markdownlint's own deterministic `fixInfo`, holocron#821) —
 * so the git mechanics (blob → tree → commit → ref-update) and the DCO
 * trailer are written once, not per-check. A per-check action's own job is
 * just mapping its findings to `{ path, content }` and choosing a commit
 * subject; this handles everything else.
 *
 * Uses the Git Data API (not the Contents API's one-commit-per-file `PUT`)
 * so N reformatted files land as one commit, not N.
 *
 * DCO: this org requires a `Signed-off-by:` trailer on every commit.
 * GitHub Apps get their own bot identity automatically on commits made via
 * an installation token (no explicit `author`/`committer` override
 * needed) — DCO checks are a message-regex match, not an identity check,
 * so `withSentinelSignoff()`'s trailer text alone satisfies it.
 *
 * Security boundary (D6-amended): writes to the caller-given branch in the
 * same repo the webhook fired for — a same-repo PR branch, not a fork's.
 * Callers are responsible for only ever passing a same-repo head ref.
 */

import type { GitHubClient } from "@theholocron/github-client";

export interface CommitFilesInput {
	client: Pick<GitHubClient, "git">;
	/** `"owner/repo"`. */
	repo: string;
	/** The branch's current head commit SHA — the new commit's own (sole) parent. */
	headSha: string;
	/** The branch name (not a SHA) — `updateRef()` moves `heads/<headRef>` to the new commit. */
	headRef: string;
	/** Files to write, each at its full repo-relative path. Empty → no-op, `committed: false`. */
	files: Array<{ path: string; content: string }>;
	/** The commit's own subject + body — pass it through `withSentinelSignoff()` for DCO. */
	message: string;
}

export interface CommitFilesResult {
	committed: boolean;
	/** Only present when `committed` is `true`. */
	commitSha?: string;
	fileCount: number;
}

export const SENTINEL_SIGNOFF_TRAILER = "Signed-off-by: Holocron Sentinel <sentinel@theholocron.dev>";

/** Appends this org's DCO trailer — every auto-fix-commit action wraps its own message with this rather than hand-writing the trailer. */
export function withSentinelSignoff(message: string): string {
	return [message, "", SENTINEL_SIGNOFF_TRAILER].join("\n");
}

export async function commitFiles(input: CommitFilesInput): Promise<CommitFilesResult> {
	const { client, repo, headSha, headRef, files, message } = input;

	if (files.length === 0) {
		return { committed: false, fileCount: 0 };
	}

	const headCommit = await client.git.getCommit(repo, headSha);

	const treeItems = await Promise.all(
		files.map(async (f) => {
			const blob = await client.git.createBlob(repo, f.content, "utf-8");
			return { path: f.path, mode: "100644", type: "blob", sha: blob.sha };
		})
	);
	const tree = await client.git.createTree(repo, treeItems, headCommit.tree.sha);

	const commit = await client.git.createCommit(repo, message, tree.sha, [headSha]);
	await client.git.updateRef(repo, `heads/${headRef}`, commit.sha);

	return { committed: true, commitSha: commit.sha, fileCount: treeItems.length };
}
