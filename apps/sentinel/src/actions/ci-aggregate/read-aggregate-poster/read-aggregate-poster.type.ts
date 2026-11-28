import type { CiAggregatePoster } from "@theholocron/astromech/config";
import type { GitHubClient } from "@theholocron/github-client";

import type { ValidateConfigResult } from "../../../utils/validate-config/index.js";

/** Who posts the aggregate for one commit, and why `actions` when that is a fallback. */
export interface ReadAggregatePosterResult {
	/** `sentinel` only when the commit's own config says so. */
	poster: CiAggregatePoster;
	/** Why the answer is `actions` for a reason other than the config saying so: no usable config at that commit. */
	reason?: string;
}

/** What {@link readAggregatePoster} reads with. */
export interface ReadAggregatePosterInput {
	/** The installation client of the repository. */
	client: Pick<GitHubClient, "git">;
	/** `owner/repo`. */
	repo: string;
	/** The pull request's head commit: the setting must match the workflow files that run for that commit. */
	sha: string;
	/** Epoch milliseconds, for the cache; `Date.now()` when left out. */
	now?: number;
	/** The cache; one per process by default. */
	cache?: Map<string, { at: number; value: ReadAggregatePosterResult }>;
	/** Replaces `validateConfig`, for tests. */
	validateConfig?: (input: {
		client: Pick<GitHubClient, "git">;
		repo: string;
		ref: string;
	}) => Promise<ValidateConfigResult>;
}
