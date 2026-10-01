/**
 * Commits `lintEditorConfig()`'s already-computed `fixes` directly onto a
 * PR's own branch — same shared `commitFiles()` primitive (holocron#820)
 * `commit-formatting-fix.ts` uses, reusing its `with: { autoFix: boolean }`
 * opt-out gate on the `sourceQuality.formatting` task rather than inventing
 * a second config knob: editorconfig is already bundled under that same
 * task's `linterGroup` (astromech's registry), so one flag governs both
 * auto-fix-commit actions it backs.
 *
 * `fixed` on each `EditorConfigFix` is `fixContent()`'s own output,
 * already computed by `lintEditorConfig()` — this action never re-fetches
 * or re-fixes a file; it only maps fixes to `commitFiles()`'s
 * `{ path, content }` shape and supplies an editorconfig-specific commit
 * subject. An empty `fixes` array (every violation was `indent_style`
 * fixing couldn't safely resolve) is `commitFiles()`'s own no-op case —
 * nothing special here for it.
 */

import type { GitHubClient } from "@theholocron/github-client";

import { commitFiles, type CommitFilesResult, withSentinelSignoff } from "../../utils/commit-files.js";
import type { LintEditorConfigResult } from "./lint-editorconfig.js";

export interface CommitEditorConfigFixInput {
	client: Pick<GitHubClient, "git">;
	/** `"owner/repo"`. */
	repo: string;
	/** The PR's current head commit SHA — the auto-fix commit's own (sole) parent. */
	headSha: string;
	/** The PR's head branch name (not a SHA) — `commitFiles()`'s own `updateRef()` input. */
	headRef: string;
	/** `lintEditorConfig()`'s result — only `fixes` (the files with a computed correction) are used. */
	result: LintEditorConfigResult;
}

export type CommitEditorConfigFixResult = CommitFilesResult;

const COMMIT_MESSAGE = withSentinelSignoff("style: apply editorconfig fixes (auto-fix via Sentinel)");

export async function commitEditorConfigFix(input: CommitEditorConfigFixInput): Promise<CommitEditorConfigFixResult> {
	const { client, repo, headSha, headRef, result } = input;

	return commitFiles({
		client,
		repo,
		headSha,
		headRef,
		files: result.fixes.map((f) => ({ path: f.file, content: f.fixed })),
		message: COMMIT_MESSAGE,
	});
}
