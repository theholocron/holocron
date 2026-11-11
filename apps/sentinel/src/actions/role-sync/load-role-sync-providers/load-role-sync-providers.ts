/**
 * Builds the two providers Sentinel's role sync drives, or says why it cannot (holocron#1595).
 *
 * The same providers `holocron sync roles` loads, made from what Sentinel has instead of a keyring:
 * the layout (which roles follow which team) is read from the default branch of one configured repo, the Discord
 * bot token and the `github.user-sync` token come from Sentinel's environment, and teams are listed with the
 * installation's own token. Nothing here throws for "not set up": a missing setting, an org that is not the
 * configured repo's, a config that does not load or has no Discord provider is a reason, so a delivery for a
 * deployment that has not turned role sync on is a quiet no-op.
 */

import { tmpdir } from "node:os";

import { createGitHubClient } from "@theholocron/github-client";
import { createPlugin as createDiscordPlugin } from "@theholocron/holocron-plugin-discord";
import { GitHubSource } from "@theholocron/holocron-plugin-github";

import { validateConfig } from "../../../utils/validate-config/index.js";
import { findDiscordOptions } from "../find-discord-options/index.js";
import type {
	LoadRoleSyncProvidersInput,
	LoadRoleSyncProvidersResult,
	RoleNotifications,
	RoleSyncFactories,
} from "./load-role-sync-providers.type.js";

/** The real providers. Only the Discord one is supported: it is the only `notifications` provider that manages roles. */
export const DEFAULT_FACTORIES: RoleSyncFactories = {
	validateConfig,
	createNotifications: (options, botToken) =>
		createDiscordPlugin({
			...options,
			// The token is handed over as the environment variable the plugin reads first, so its keyring (absent
			// on a serverless function) is never asked.
			env: { HOLOCRON_DISCORD_BOT_TOKEN: botToken },
		}).capabilities.notifications() as RoleNotifications,
	createSource: (installation, userSyncToken, repo) =>
		new GitHubSource(installation, {
			repo,
			repoRoot: tmpdir(),
			userSyncClient: createGitHubClient({ token: userSyncToken }),
		}),
};

/** Loads the providers for an org's delivery; see the module comment. */
export async function loadRoleSyncProviders(input: LoadRoleSyncProvidersInput): Promise<LoadRoleSyncProvidersResult> {
	const { env, org, client } = input;
	const factories = input.factories ?? DEFAULT_FACTORIES;

	const repo = env.SENTINEL_ROLE_SYNC_REPO;
	if (!repo) return { ok: false, reason: "role sync is off: SENTINEL_ROLE_SYNC_REPO is not set" };
	if (repo.split("/")[0]!.toLowerCase() !== org.toLowerCase()) {
		return { ok: false, reason: `role sync is configured for ${repo}, not for the ${org} organisation` };
	}
	const botToken = env.HOLOCRON_DISCORD_BOT_TOKEN;
	if (!botToken) return { ok: false, reason: "role sync is off: HOLOCRON_DISCORD_BOT_TOKEN is not set" };
	const userSyncToken = env.HOLOCRON_USER_SYNC_TOKEN;
	if (!userSyncToken) return { ok: false, reason: "role sync is off: HOLOCRON_USER_SYNC_TOKEN is not set" };

	const validated = await factories.validateConfig({ client, repo });
	if (validated.status !== "valid") {
		return { ok: false, reason: `${repo} has no usable holocron config (${validated.status})` };
	}
	const discord = findDiscordOptions(validated.config, repo);
	if (!discord.ok) return discord;

	return {
		ok: true,
		notifications: factories.createNotifications(discord.options, botToken),
		source: factories.createSource(client, userSyncToken, repo),
	};
}
