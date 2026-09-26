/**
 * Posts a PR comment explaining what `commitFormattingFix()` just changed
 * (holocron#674/#834) — pulled out of #674's "PR comments" backlog item.
 * Uses `@theholocron/github-client`'s `issues.createComment()`, already
 * exported (no cross-repo change needed, unlike the Checks API
 * annotations work in holocron#816/#817).
 *
 * Fires only when a fix was actually committed — no comment when there
 * was nothing to fix, avoiding noise on every PR. Self-guards on
 * `fixResult.committed` the same way `commitFiles()` self-guards on an
 * empty `files` array — belt-and-suspenders, since the caller's own gate
 * already only invokes this when a fix was attempted.
 */

import type { GitHubClient } from "@theholocron/github-client";

import type { CommitFormattingFixResult } from "./commit-formatting-fix.js";
import type { LintFormattingResult } from "./lint-formatting.js";

export interface PostAutoFixCommentInput {
	client: Pick<GitHubClient, "issues">;
	/** `"owner/repo"`. */
	repo: string;
	pullNumber: number;
	/** `commitFormattingFix()`'s own result — only acts when `committed` is `true`. */
	fixResult: CommitFormattingFixResult;
	/** `lintFormatting()`'s result — `messages` names which files were reformatted. */
	lintResult: LintFormattingResult;
}

export interface PostAutoFixCommentResult {
	posted: boolean;
}

function commentBody(lintResult: LintFormattingResult, commitSha: string | undefined): string {
	const fileList = lintResult.messages.map((m) => `- \`${m.file}\``).join("\n");
	return [
		`Sentinel auto-formatted ${lintResult.messages.length} file(s) per this org's shared prettier config:`,
		"",
		fileList,
		"",
		`Commit: ${commitSha}`,
	].join("\n");
}

export async function postAutoFixComment(input: PostAutoFixCommentInput): Promise<PostAutoFixCommentResult> {
	const { client, repo, pullNumber, fixResult, lintResult } = input;

	if (!fixResult.committed) {
		return { posted: false };
	}

	await client.issues.createComment(repo, pullNumber, commentBody(lintResult, fixResult.commitSha));

	return { posted: true };
}
