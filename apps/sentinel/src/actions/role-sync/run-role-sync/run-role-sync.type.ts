import type { GitHubClient } from "@theholocron/github-client";

import type {
	LoadRoleSyncProvidersInput,
	LoadRoleSyncProvidersResult,
	RoleSyncEnv,
} from "../load-role-sync-providers/index.js";

export interface RunRoleSyncInput {
	/** The installation client of the org the delivery is about. */
	client: GitHubClient;
	env: RoleSyncEnv;
	org: string;
	/** The team that changed; every team a role follows when left out (an org-level delivery). */
	team?: string;
	/** Replaces the provider loader, for tests. */
	loadProviders?: (input: LoadRoleSyncProvidersInput) => Promise<LoadRoleSyncProvidersResult>;
}
