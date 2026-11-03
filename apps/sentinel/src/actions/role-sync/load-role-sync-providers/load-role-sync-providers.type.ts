import type { GitHubClient } from "@theholocron/github-client";
import type { DiscordNotifications } from "@theholocron/holocron-plugin-discord";
import type { GitHubSource } from "@theholocron/holocron-plugin-github";

import type { ValidateConfigInput, ValidateConfigResult } from "../../../utils/validate-config/index.js";

/**
 * The providers, as the plugins' own classes. (Not the CLI's `Notifications` and `Source` interfaces they
 * implement: the bundler's type pass cannot find the inlined CLI's types by name. The classes satisfy the
 * interfaces `syncRoles` takes.)
 */
export type RoleNotifications = DiscordNotifications;
/** The provider that lists a team's members and reads the links file. */
export type RoleSource = GitHubSource;

export interface RoleSyncEnv {
	/** `owner/repo` whose default-branch `holocron.config.ts` declares the notifications layout (the roles and their teams). */
	SENTINEL_ROLE_SYNC_REPO?: string;
	/** The Discord bot token (the same one `holocron notifications setup` uses). */
	HOLOCRON_DISCORD_BOT_TOKEN?: string;
	/** The `github.user-sync` token: reads the links file in the org's private config repo. */
	HOLOCRON_USER_SYNC_TOKEN?: string;
}

/** Builds the two providers; replaced in tests so no plugin makes a request. */
export interface RoleSyncFactories {
	/** Reads a repo's default-branch config. */
	validateConfig: (input: ValidateConfigInput) => Promise<ValidateConfigResult>;
	/** Builds the Discord `notifications` capability from the config's options and the bot token. */
	createNotifications: (options: Record<string, unknown>, botToken: string) => RoleNotifications;
	/** Builds the GitHub `source` capability: the installation client lists teams, the user-sync client reads the links file. */
	createSource: (installation: GitHubClient, userSyncToken: string, repo: string) => RoleSource;
}

export interface LoadRoleSyncProvidersInput {
	/** The installation client of the org the delivery is about. */
	client: GitHubClient;
	env: RoleSyncEnv;
	/** The org the delivery is about. */
	org: string;
	factories?: RoleSyncFactories;
}

/** Either the two providers, or why role sync does not run for this delivery (never an error: not set up is a normal state). */
export type LoadRoleSyncProvidersResult =
	{ ok: true; notifications: RoleNotifications; source: RoleSource } | { ok: false; reason: string };
