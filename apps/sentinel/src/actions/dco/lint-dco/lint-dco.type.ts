import type { GitHubClient } from "@theholocron/github-client";

export interface LintDcoInput {
	client: Pick<GitHubClient, "pulls">;
	/** `"owner/repo"`. */
	repo: string;
	pullNumber: number;
}

export interface DcoViolation {
	sha: string;
	/** The commit's own author name/email, exactly as git recorded it — shown so a contributor knows exactly what a matching trailer needs to say. */
	author: string;
}

export interface LintDcoResult {
	valid: boolean;
	/** Commits actually checked — a merge or bot-authored commit is exempt, so this can be smaller than the PR's total commit count. */
	commitCount: number;
	violations: DcoViolation[];
}
