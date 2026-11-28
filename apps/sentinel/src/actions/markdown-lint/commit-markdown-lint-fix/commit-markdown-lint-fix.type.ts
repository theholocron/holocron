import type { GitHubClient } from "@theholocron/github-client";

import type { CommitFilesResult } from "../../../utils/index.js";
import type { LintMarkdownResult } from "../lint-markdown/index.js";

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
