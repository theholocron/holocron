import type { GitHubClient } from "@theholocron/github-client";

export interface LintInclusiveLanguageInput {
	client: Pick<GitHubClient, "pulls" | "git">;
	/** `"owner/repo"`. */
	repo: string;
	pullNumber: number;
	/** The PR's own head ref (branch or SHA) — reads each changed file's content there, not the default branch. */
	ref: string;
}

export interface InclusiveLanguageMessage {
	file: string;
	line: number;
	column: number;
	/** commitlint's own message for the failure, e.g. "`He` may be insensitive, use `They`, `It` instead". */
	reason: string;
	ruleId: string;
	/** Which underlying retext plugin raised this — `"retext-profanities"` (violent/vulgar wording) or `"retext-equality"` (gendered/insensitive phrasing), the two `alex` bundles. Drives `post-inclusive-language-check.ts`'s per-message annotation severity. */
	source?: string;
	/**
	 * `retext-profanities`-only: `cuss`'s 0-2 sureness rating for how likely
	 * `actual` is used as profanity rather than clean text (0 = "beaver",
	 * unlikely; 2 = "asshat", likely) — not how severe the word itself is.
	 * Not a field `vfile-message`'s own type declares (each retext plugin
	 * attaches its own extra data to the message object at runtime), hence
	 * the cast at the one call site that reads it.
	 */
	profanitySeverity?: number;
}

export interface LintInclusiveLanguageResult {
	valid: boolean;
	fileCount: number;
	messages: InclusiveLanguageMessage[];
}
