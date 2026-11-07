import type { GitHubClient } from "@theholocron/github-client";

import type { RoleNotifications, RoleSyncFactories } from "../../role-sync/index.js";
import type { PrFeedChannel } from "../pr-feed-channel/index.js";

/** What the feed reads from Sentinel's environment: the same two settings as role sync (it needs no user-sync token). */
export interface PrFeedEnv {
	/** `owner/repo` whose default-branch config holds the notifications layout. */
	SENTINEL_ROLE_SYNC_REPO?: string;
	/** The Discord bot token. */
	HOLOCRON_DISCORD_BOT_TOKEN?: string;
}

/** The pieces the loader builds the provider from; the real ones are role sync's. */
export type PrFeedFactories = Pick<RoleSyncFactories, "validateConfig" | "createNotifications">;

export interface LoadPrFeedInput {
	/** The installation client of the delivery. */
	client: GitHubClient;
	env: PrFeedEnv;
	/** The organisation of the repository the delivery is about. */
	org: string;
	factories?: PrFeedFactories;
}

/** The provider and the forum, or why the feed does not run for this delivery (not set up is a normal state, not an error). */
export type LoadPrFeedResult =
	{ ok: true; notifications: RoleNotifications; channel: PrFeedChannel } | { ok: false; reason: string };
