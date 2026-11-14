import type { PermissionRule, TokenExpectation } from "@theholocron/cli";

import { BOT_NEEDS } from "../../bot-needs.js";

/** The name the probe's row uses for being a member of the configured server, beside the permission names. */
export const GUILD = "guild";

/** What the bot token must do in a layer: be in the server and hold every permission `setup` needs. */
const EVERYTHING: Record<string, PermissionRule> = {
	[GUILD]: "required",
	...Object.fromEntries(BOT_NEEDS.map((name) => [name, "required" as const])),
};

/**
 * What each layer's bot token is meant to carry. It is one bot, so every layer that holds the token (a laptop, CI,
 * Sentinel in `prod`) needs the same: to be a member of the configured server with the permissions of `BOT_NEEDS`,
 * the list `setup`'s invite link and `doctor notifications` use. Permissions only a layout asks for (Pin Messages,
 * Manage Threads, Add Reactions) are added by the probe from the same `botNeeds()`. This is the plugin's `tokens`
 * declaration, read through `tokenExpectations()`; change it and the Discord section of
 * `docs/src/content/docs/tokens.mdx` together.
 */
export const EXPECTED: TokenExpectation = {
	permissions: { local: EVERYTHING, dev: EVERYTHING, ci: EVERYTHING, prod: EVERYTHING },
};
