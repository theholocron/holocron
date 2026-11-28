import type { GitHubClient } from "@theholocron/github-client";

import type { CommitFilesResult } from "../../../utils/index.js";
import type { LintFormattingResult } from "../lint-formatting/index.js";

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
