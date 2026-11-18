import type { BoardTemplate, Projects } from "@theholocron/cli";
import type { GitHubClient } from "@theholocron/github-client";

import type { ValidateConfigInput, ValidateConfigResult } from "../../../utils/validate-config/index.js";

/** What the board handler reads from Sentinel's environment: the one setting role sync and the feed also read. */
export interface BoardStatusEnv {
	/** `owner/repo` whose default-branch `holocron.config.ts` declares `providers.projects`. */
	SENTINEL_ROLE_SYNC_REPO?: string;
}

/** The pieces the loader builds the provider from; the real ones read the config and make the GitHub provider. */
export interface BoardStatusFactories {
	/** Reads a repo's default-branch config. */
	validateConfig: (input: ValidateConfigInput) => Promise<ValidateConfigResult>;
	/** Builds the `projects` capability over the installation's own client; `repo` is the one `#N` keys are relative to. */
	createProjects: (client: GitHubClient, repo: string) => Projects;
}

export interface LoadBoardStatusInput {
	/** The installation client of the delivery. */
	client: GitHubClient;
	env: BoardStatusEnv;
	/** `owner/repo` the delivery is about. */
	repo: string;
	factories?: BoardStatusFactories;
}

/** One declared board and the template it follows. */
export interface DeclaredBoard {
	name: string;
	template: BoardTemplate;
}

/** The provider and the boards, or why the handler does not run for this delivery (not set up is a normal state). */
export type LoadBoardStatusResult =
	{ ok: true; projects: Projects; owner: string; boards: DeclaredBoard[] } | { ok: false; reason: string };
