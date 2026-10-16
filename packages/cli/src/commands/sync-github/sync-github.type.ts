import type { Logger } from "@theholocron/observability/core";

export type SyncGithubStatus = "ok" | "fail" | "dry-run";

export interface RunSyncGithubInput {
	/** GitHub personal access token with repo write access. */
	token: string;
	/** Target org/repo. Defaults to "theholocron/.github". */
	repo?: string;
	/**
	 * Push files to this branch instead of the default branch.
	 * If the branch doesn't exist it is created from the default branch HEAD.
	 * Combine with `createPr: true` to open a PR after the push.
	 */
	branch?: string;
	/** After pushing to `branch`, open a PR to the default branch. No-op if `branch` is unset. */
	createPr?: boolean;
	/** Commit message for the sync commit. */
	message?: string;
	dryRun?: boolean;
	/**
	 * Write generated files to this local directory instead of pushing to the GitHub API.
	 * Useful for local validation (e.g. actionlint) before a real sync run.
	 * When set, no API calls are made and token is not required.
	 */
	outputDir?: string;
	print?: (line: string) => void;
	/** Structured-logging sink — sibling of `print`. Defaults to the command-bound root. */
	logger?: Logger;
	/** Injectable for testing. */
	fetch?: typeof globalThis.fetch;
}

export interface SyncGithubReport {
	status: SyncGithubStatus;
	created: number;
	updated: number;
	unchanged: number;
	/** URL of the opened PR, when createPr is true and changes were made. */
	prUrl?: string;
	message?: string;
}

export type FileBatch = Array<{ path: string; content: string }>;
