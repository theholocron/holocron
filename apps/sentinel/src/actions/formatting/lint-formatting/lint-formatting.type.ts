import type { GitHubClient } from "@theholocron/github-client";

export interface LintFormattingInput {
	client: Pick<GitHubClient, "pulls" | "git">;
	/** `"owner/repo"`. */
	repo: string;
	pullNumber: number;
	/** The PR's own head ref (branch or SHA) — reads each changed file's content there, not the default branch. */
	ref: string;
}

export interface FormattingMessage {
	file: string;
	/** 1-indexed — the first line that would change if reformatted (prettier reports pass/fail per file, not per-line findings the way alex does; this is the closest real anchor point without a full diff). */
	line: number;
	reason: string;
	/** `format()`'s own output — the deterministic fix, already computed here. Consumed by the auto-fix-commit action (holocron#820) so it never re-fetches or re-formats a file this check already processed. */
	formatted: string;
}

export interface LintFormattingResult {
	valid: boolean;
	/** Files prettier actually checked — narrower than every changed file, since files with no `inferredParser` (or matching `PRETTIER_IGNORE_PATTERNS`) are skipped entirely. */
	fileCount: number;
	messages: FormattingMessage[];
}
