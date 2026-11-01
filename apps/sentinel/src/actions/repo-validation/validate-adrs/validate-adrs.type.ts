import type { SpecFinding } from "@theholocron/astromech/repo-validation";
import type { GitHubClient } from "@theholocron/github-client";

export interface ValidateAdrsInput {
	client: Pick<GitHubClient, "pulls" | "git">;
	/** `"owner/repo"`. */
	repo: string;
	pullNumber: number;
	/** The PR's own head ref (branch or SHA) — reads each changed file's content there. */
	ref: string;
}

/**
 * One finding of the ADR and spec check: the file, the offending field's 1-indexed line, the field (`rule`), the
 * reason and the severity. Defined once, in astromech, as `SpecFinding`.
 */
export type AdrMessage = SpecFinding;

export interface ValidateAdrsResult {
	valid: boolean;
	fileCount: number;
	messages: AdrMessage[];
}
