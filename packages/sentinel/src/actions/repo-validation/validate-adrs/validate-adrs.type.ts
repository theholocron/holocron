import type { GitHubClient } from "@theholocron/github-client";

export interface ValidateAdrsInput {
	client: Pick<GitHubClient, "pulls" | "git">;
	/** `"owner/repo"`. */
	repo: string;
	pullNumber: number;
	/** The PR's own head ref (branch or SHA) — reads each changed file's content there. */
	ref: string;
}

export interface AdrMessage {
	file: string;
	/** 1-indexed — the offending frontmatter field's own line, or the file's first line when the field (or the whole frontmatter) is missing. */
	line: number;
	/** The frontmatter field at fault (`id`, `status`, …), or `frontmatter` when there's none at all. */
	rule: string;
	reason: string;
	severity: "error" | "warning";
}

export interface ValidateAdrsResult {
	valid: boolean;
	fileCount: number;
	messages: AdrMessage[];
}

export interface Field {
	value: string;
	line: number;
}
