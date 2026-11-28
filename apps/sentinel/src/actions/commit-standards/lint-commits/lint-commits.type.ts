import type { GitHubClient } from "@theholocron/github-client";

export interface LintCommitsInput {
	client: Pick<GitHubClient, "pulls">;
	/** `"owner/repo"`. */
	repo: string;
	pullNumber: number;
}

export interface CommitViolation {
	sha: string;
	/** Rule name, e.g. `"subject-empty"`. */
	rule: string;
	/** commitlint's own message for the failure, e.g. `"subject may not be empty"`. */
	message: string;
}

export interface LintCommitsResult {
	valid: boolean;
	commitCount: number;
	violations: CommitViolation[];
}
