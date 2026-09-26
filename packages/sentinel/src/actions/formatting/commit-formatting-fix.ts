/**
 * Commits `lintFormatting()`'s already-computed fix directly onto a PR's
 * own branch — the first consumer of the shared `commitFiles()` primitive
 * (holocron#820, `utils/commit-files.ts`). Opt-in per repo (`{ name:
 * "sourceQuality.formatting", with: { autoFix: true } }` in
 * `holocron.config.ts`'s `tasks` array), unlike every other Bucket 1
 * check, which is config-free by design — writing to repo content is
 * qualitatively different from reading and reporting, and deserves an
 * explicit opt-in rather than inheriting config-free-by-default.
 *
 * `formatted` on each `FormattingMessage` is `format()`'s own output,
 * already computed by `lintFormatting()` — this action never re-fetches
 * or re-formats a file; it only maps findings to `commitFiles()`'s
 * `{ path, content }` shape and supplies a formatting-specific commit
 * subject.
 */

import type { GitHubClient } from "@theholocron/github-client";

import { commitFiles, type CommitFilesResult, withSentinelSignoff } from "../../utils/commit-files.js";
import type { LintFormattingResult } from "./lint-formatting.js";

export interface CommitFormattingFixInput {
	client: Pick<GitHubClient, "git">;
	/** `"owner/repo"`. */
	repo: string;
	/** The PR's current head commit SHA — the auto-fix commit's own (sole) parent. */
	headSha: string;
	/** The PR's head branch name (not a SHA) — `commitFiles()`'s own `updateRef()` input. */
	headRef: string;
	/** `lintFormatting()`'s result — only `messages` (the files that need reformatting) are used. */
	result: LintFormattingResult;
}

export type CommitFormattingFixResult = CommitFilesResult;

const COMMIT_MESSAGE = withSentinelSignoff("style: apply prettier formatting (auto-fix via Sentinel)");

export async function commitFormattingFix(input: CommitFormattingFixInput): Promise<CommitFormattingFixResult> {
	const { client, repo, headSha, headRef, result } = input;

	return commitFiles({
		client,
		repo,
		headSha,
		headRef,
		files: result.messages.map((m) => ({ path: m.file, content: m.formatted })),
		message: COMMIT_MESSAGE,
	});
}
