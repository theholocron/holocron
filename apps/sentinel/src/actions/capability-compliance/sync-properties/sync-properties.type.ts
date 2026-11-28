import type { GitHubClient } from "@theholocron/github-client";

export interface SyncPropertiesInput {
	client: Pick<GitHubClient, "git" | "properties">;
	/** `"owner/repo"`. */
	repo: string;
	/** The repo's default branch — from the push webhook payload (`repository.default_branch`). */
	defaultBranch: string;
	/**
	 * The already-loaded `holocron.config.*` object — pass `validateConfig()`'s
	 * `config` from its `"valid"` result to avoid re-fetching. Read loosely
	 * here (this function only needs `repo` and `providers`, not the full
	 * shape any one caller's type narrows it to).
	 */
	config: Record<string, unknown>;
}

export interface SyncPropertiesResult {
	/** Every property value actually sent — for logging/check-run reporting by the caller. */
	properties: Record<string, string | string[]>;
}

export interface ConfigRepoShape {
	repo?: {
		protection?: string;
		properties?: {
			lifecycle?: string;
			open_source?: boolean;
			runtime_environment?: string;
			uses_external_packages?: boolean;
		};
	};
	providers?: Record<string, unknown>;
}
