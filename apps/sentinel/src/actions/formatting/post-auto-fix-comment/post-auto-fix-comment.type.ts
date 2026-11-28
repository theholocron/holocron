import type { GitHubClient } from "@theholocron/github-client";

import type { CommitFormattingFixResult } from "../commit-formatting-fix/index.js";
import type { LintFormattingResult } from "../lint-formatting/index.js";

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
