import type { GitHubClient } from "@theholocron/github-client";

import type { ValidateConfigResult } from "../../../utils/validate-config/index.js";

/** The ids and contexts the aggregate waits on, from a repository's config at one ref. */
export type ReadAggregateChecksResult =
	{ ok: true; expected: string[]; statuses: string[] } | { ok: false; reason: string };

/** What {@link readAggregateChecks} reads with. */
export interface ReadAggregateChecksInput {
	/** The installation client of the repository. */
	client: Pick<GitHubClient, "git">;
	/** `owner/repo`. */
	repo: string;
	/** The pull request's base branch: the gate is what the base declares, so a pull request cannot shrink its own. */
	baseRef: string;
	/** Epoch milliseconds, for the cache; `Date.now()` when left out. */
	now?: number;
	/** The cache; one per process by default, so a warm instance reads each config once in a few minutes. */
	cache?: Map<string, { at: number; value: ReadAggregateChecksResult }>;
	/** Replaces `validateConfig`, for tests. */
	validateConfig?: (input: {
		client: Pick<GitHubClient, "git">;
		repo: string;
		ref: string;
	}) => Promise<ValidateConfigResult>;
}
