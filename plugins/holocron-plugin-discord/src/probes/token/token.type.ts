import type { NotificationsLayout } from "@theholocron/cli";

import type { DiscordBotClient } from "../../rest.js";

/** What the `token` probe reads from the plugin: the server, the layout (for what the bot keeps), the token and a bot client built with it. */
export interface TokenProbeContext {
	/** The plugin's options; the server id and the layout, whose needs add to the usual permissions. */
	options: { guildId?: string; layout?: NotificationsLayout };
	/** The client the token is used through. */
	bot: () => DiscordBotClient;
	/** What a layer's token must and must not carry, by permission; defaults to the plugin's `tokens` declaration. A seam for tests. */
	rules?: (layer: string, envName: string) => Readonly<Record<string, "required" | "absent">> | undefined;
	/** The bot token to check, marked secret so it is never printed. Throws an `AuthError` when none is set. */
	token: () => string;
}
