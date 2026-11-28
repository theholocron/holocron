import type { GitHubClient } from "@theholocron/github-client";

import type { CommitFilesResult } from "../../../utils/index.js";
import type { LintEditorConfigResult } from "../lint-editorconfig/index.js";

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
