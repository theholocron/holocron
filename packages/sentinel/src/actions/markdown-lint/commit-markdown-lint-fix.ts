/**
 * Commits `lintMarkdown()`'s already-computed `fixes` directly onto a PR's
 * own branch — same shared `commitFiles()` primitive (holocron#820)
 * `commit-formatting-fix.ts`/`commit-editorconfig-fix.ts` use, reusing
 * their `with: { autoFix: boolean }` opt-out gate on the
 * `sourceQuality.formatting` task rather than inventing a third config
 * knob: markdownlint is already bundled under that same task's
 * `linterGroup` (astromech's registry), alongside prettier and
 * editorconfig, so one flag governs all three auto-fix-commit actions.
 *
 * `fixed` on each `MarkdownLintFix` is `applyFixes()`'s own output,
 * already computed by `lintMarkdown()` — this action never re-fetches or
 * re-lints a file; it only maps fixes to `commitFiles()`'s `{ path,
 * content }` shape and supplies a markdownlint-specific commit subject.
 * An empty `fixes` array (every finding was a rule with no deterministic
 * fix, e.g. MD001 heading-increment) is `commitFiles()`'s own no-op case
 * — nothing special here for it.
 */

import type { GitHubClient } from "@theholocron/github-client";

import { commitFiles, type CommitFilesResult, withSentinelSignoff } from "../../utils/commit-files.js";
import type { LintMarkdownResult } from "./lint-markdown.js";

export interface CommitMarkdownLintFixInput {
	client: Pick<GitHubClient, "git">;
	/** `"owner/repo"`. */
	repo: string;
	/** The PR's current head commit SHA — the auto-fix commit's own (sole) parent. */
	headSha: string;
	/** The PR's head branch name (not a SHA) — `commitFiles()`'s own `updateRef()` input. */
	headRef: string;
	/** `lintMarkdown()`'s result — only `fixes` (the files with a computed correction) are used. */
	result: LintMarkdownResult;
}

export type CommitMarkdownLintFixResult = CommitFilesResult;

const COMMIT_MESSAGE = withSentinelSignoff("style: apply markdownlint fixes (auto-fix via Sentinel)");

export async function commitMarkdownLintFix(input: CommitMarkdownLintFixInput): Promise<CommitMarkdownLintFixResult> {
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
