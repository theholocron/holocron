/**
 * Commits `lintFormatting()`'s already-computed fix directly onto a PR's
 * own branch — the first Sentinel auto-fix-commit capability (holocron#820).
 * Opt-in per repo (`{ name: "sourceQuality.formatting", with: { autoFix:
 * true } }` in `holocron.config.ts`'s `tasks` array), unlike every other
 * Bucket 1 check, which is config-free by design — writing to repo content
 * is qualitatively different from reading and reporting, and deserves an
 * explicit opt-in rather than inheriting config-free-by-default.
 *
 * One atomic commit across every reformatted file via the Git Data API
 * (`getCommit` → `createBlob` ×N → `createTree` with `base_tree` →
 * `createCommit` → `updateRef`) rather than the Contents API's one-commit-
 * per-file `PUT`. `formatted` on each `FormattingMessage` is `format()`'s
 * own output, already computed by `lintFormatting()` — this action never
 * re-fetches or re-formats a file.
 *
 * DCO: this org requires a `Signed-off-by:` trailer on every commit. GitHub
 * Apps get their own bot identity automatically on commits made via an
 * installation token (no explicit `author`/`committer` override needed) —
 * DCO checks are a message-regex match, not an identity check, so the
 * trailer text alone satisfies it.
 *
 * Security boundary (D6-amended, same as `lint-formatting.ts`): writes to
 * the PR's own head branch in the same repo the webhook fired for — a
 * same-repo PR branch, not a fork's.
 */

import type { GitHubClient } from "@theholocron/github-client";

import type { LintFormattingResult } from "./lint-formatting.js";

export interface CommitFormattingFixInput {
	client: Pick<GitHubClient, "git">;
	/** `"owner/repo"`. */
	repo: string;
	/** The PR's current head commit SHA — the auto-fix commit's own (sole) parent. */
	headSha: string;
	/** The PR's head branch name (not a SHA) — `updateRef()` moves `heads/<headRef>` to the new commit. */
	headRef: string;
	/** `lintFormatting()`'s result — only `messages` (the files that need reformatting) are used. */
	result: LintFormattingResult;
}

export interface CommitFormattingFixResult {
	committed: boolean;
	/** Only present when `committed` is `true`. */
	commitSha?: string;
	fileCount: number;
}

const COMMIT_MESSAGE = [
	"style: apply prettier formatting (auto-fix via Sentinel)",
	"",
	"Signed-off-by: Holocron Sentinel <sentinel@theholocron.dev>",
].join("\n");

export async function commitFormattingFix(input: CommitFormattingFixInput): Promise<CommitFormattingFixResult> {
	const { client, repo, headSha, headRef, result } = input;

	if (result.messages.length === 0) {
		return { committed: false, fileCount: 0 };
	}

	const headCommit = await client.git.getCommit(repo, headSha);

	const treeItems = await Promise.all(
		result.messages.map(async (m) => {
			const blob = await client.git.createBlob(repo, m.formatted, "utf-8");
			return { path: m.file, mode: "100644", type: "blob", sha: blob.sha };
		})
	);
	const tree = await client.git.createTree(repo, treeItems, headCommit.tree.sha);

	const commit = await client.git.createCommit(repo, COMMIT_MESSAGE, tree.sha, [headSha]);
	await client.git.updateRef(repo, `heads/${headRef}`, commit.sha);

	return { committed: true, commitSha: commit.sha, fileCount: treeItems.length };
}
