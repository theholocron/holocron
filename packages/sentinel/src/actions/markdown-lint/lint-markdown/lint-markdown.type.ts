import type { GitHubClient } from "@theholocron/github-client";

export interface LintMarkdownInput {
	client: Pick<GitHubClient, "pulls" | "git">;
	/** `"owner/repo"`. */
	repo: string;
	pullNumber: number;
	/** The PR's own head ref (branch or SHA) — reads each changed file's content there, not the default branch. */
	ref: string;
}

export interface MarkdownLintMessage {
	file: string;
	/** 1-indexed. */
	line: number;
	ruleNames: string[];
	/** markdownlint's own `ruleDescription`, e.g. "Heading levels should only increment by one level at a time". */
	reason: string;
	/** `[startColumn, length]`, 1-indexed — `null` when the rule can't localize the finding to a specific span on the line. */
	errorRange: number[] | null;
	/** markdownlint's own per-rule severity — defaults to `"error"` unless `@theholocron/markdownlint-config` configures a rule as `{ severity: "warning" }`. */
	severity: "error" | "warning";
}

export interface MarkdownLintFix {
	file: string;
	/** `applyFixes()`'s own output — same shape as `EditorConfigFix.fixed`/`FormattingMessage.formatted`. */
	fixed: string;
}

export interface LintMarkdownResult {
	valid: boolean;
	fileCount: number;
	messages: MarkdownLintMessage[];
	/** One entry per file `applyFixes()` actually changed — a strict subset of `messages`' files, since some rules (e.g. MD001) have no deterministic fix at all. Empty whenever nothing was auto-fixable. */
	fixes: MarkdownLintFix[];
}
