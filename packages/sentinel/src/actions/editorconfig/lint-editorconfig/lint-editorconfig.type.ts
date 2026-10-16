import type { GitHubClient } from "@theholocron/github-client";

export interface LintEditorConfigInput {
	client: Pick<GitHubClient, "pulls" | "git">;
	/** `"owner/repo"`. */
	repo: string;
	pullNumber: number;
	/** The PR's own head ref (branch or SHA) — reads each changed file's content there, not the default branch. */
	ref: string;
}

export interface EditorConfigMessage {
	file: string;
	/** 1-indexed — the first line with a violation. */
	line: number;
	reason: string;
}

export interface EditorConfigFix {
	file: string;
	/** The full corrected file content — `commit-editorconfig-fix.ts`'s own input, same shape as `FormattingMessage.formatted`. */
	fixed: string;
}

export interface LintEditorConfigResult {
	valid: boolean;
	/** Files actually checked — 0 whenever the repo has no root `.editorconfig` at all, not an error, just nothing to check against. */
	fileCount: number;
	messages: EditorConfigMessage[];
	/** One entry per file whose content changed under `fixContent()` — a strict subset of `messages`' files, since `indent_style` can leave a flagged line unfixed (see this module's own docstring). Empty whenever nothing was auto-fixable. */
	fixes: EditorConfigFix[];
}
