import { DEFAULT_FACTORIES, findDiscordOptions } from "../../role-sync/index.js";
import { prFeedChannel } from "../pr-feed-channel/index.js";
import type { LoadPrFeedInput, LoadPrFeedResult } from "./load-pr-feed.type.js";

/**
 * Builds the Discord provider for the #prs feed and finds its forum, or says why it cannot (holocron#1833).
 *
 * Like role sync's loader, and from the same settings: the layout is read from the default branch of
 * `SENTINEL_ROLE_SYNC_REPO` (`.holocron/` area files included, through `validateConfig`) and the bot token is
 * `HOLOCRON_DISCORD_BOT_TOKEN`. Nothing throws for "not set up": a missing setting, an organisation that is not the
 * configured repo's, a config that does not load, no Discord provider or no forum with `feeds.prs` is a reason.
 */
export async function loadPrFeed(input: LoadPrFeedInput): Promise<LoadPrFeedResult> {
	const { env, org, client } = input;
	const factories = input.factories ?? DEFAULT_FACTORIES;

	const repo = env.SENTINEL_ROLE_SYNC_REPO;
	if (!repo) return { ok: false, reason: "the pull request feed is off: SENTINEL_ROLE_SYNC_REPO is not set" };
	if (repo.split("/")[0]!.toLowerCase() !== org.toLowerCase()) {
		return {
			ok: false,
			reason: `the pull request feed is configured for ${repo}, not for the ${org} organisation`,
		};
	}
	const botToken = env.HOLOCRON_DISCORD_BOT_TOKEN;
	if (!botToken) {
		return { ok: false, reason: "the pull request feed is off: HOLOCRON_DISCORD_BOT_TOKEN is not set" };
	}

	const validated = await factories.validateConfig({ client, repo });
	if (validated.status !== "valid") {
		return { ok: false, reason: `${repo} has no usable holocron config (${validated.status})` };
	}
	const discord = findDiscordOptions(validated.config, repo);
	if (!discord.ok) return discord;

	const notifications = factories.createNotifications(discord.options, botToken);
	const channel = prFeedChannel(notifications.layout);
	if (!channel) return { ok: false, reason: `${repo}'s layout has no forum with feeds.prs` };
	return { ok: true, notifications, channel };
}
