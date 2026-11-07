import { type RawProvidersConfig, resolveEntry } from "@theholocron/cli";

import type { FindDiscordOptionsResult } from "./find-discord-options.type.js";

/**
 * The options of the `discord` entry in a config's `providers.notifications`, or why there is none. Shared by role
 * sync and the #prs feed, which both build the Discord capability from the config of the one repo that holds the layout.
 */
export function findDiscordOptions(config: unknown, repo: string): FindDiscordOptionsResult {
	const raw = (config as { providers?: RawProvidersConfig }).providers?.notifications;
	if (!raw) return { ok: false, reason: `${repo} declares no notifications provider` };
	const resolved = resolveEntry("notifications", raw);
	// `notifications` takes several providers, so an entry always resolves to a list.
	const { tuples } = resolved as Extract<typeof resolved, { cardinality: "many" }>;
	const discord = tuples.find((t) => t.provider === "discord");
	if (!discord) return { ok: false, reason: `${repo} declares no discord notifications provider` };
	return { ok: true, options: discord.options };
}
