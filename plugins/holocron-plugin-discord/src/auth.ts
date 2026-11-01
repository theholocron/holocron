import { AuthError, createResolveToken, type PluginToken, type ResolveTokenInput } from "@theholocron/cli";

export { AuthError };
export type { ResolveTokenInput };

// For Discord, the "token" stored in the keyring is the full webhook URL.
/** Resolves the Discord webhook URL from `--token`, `HOLOCRON_DISCORD_WEBHOOK`, `DISCORD_WEBHOOK_URL` or the keyring, and throws an `AuthError` when none is set. */
export const resolveToken = createResolveToken({
	envName: "HOLOCRON_DISCORD_WEBHOOK",
	vendorEnvName: "DISCORD_WEBHOOK_URL",
	keyringService: "discord",
	errorMessage:
		"no Discord webhook URL found. Pass --token <WEBHOOK_URL>, set HOLOCRON_DISCORD_WEBHOOK / DISCORD_WEBHOOK_URL, " +
		"or run: holocron auth set discord <https://discord.com/api/webhooks/...>",
});

// Provisioning (channels, roles, webhooks) needs a bot token, not a webhook URL.
/** Resolves the Discord bot token used to provision channels, roles and webhooks, from `HOLOCRON_DISCORD_BOT_TOKEN`, `DISCORD_BOT_TOKEN` or the keyring. */
export const resolveBotToken = createResolveToken({
	envName: "HOLOCRON_DISCORD_BOT_TOKEN",
	vendorEnvName: "DISCORD_BOT_TOKEN",
	// Dotted like `github.admin`: `holocron auth set discord.holonet <token>` stores it directly (no plugin lookup).
	keyringService: "discord.holonet",
	errorMessage:
		"no Discord bot token found. Set HOLOCRON_DISCORD_BOT_TOKEN (or DISCORD_BOT_TOKEN), or run: " +
		"holocron auth set discord.holonet <token> — it is the bot token from the Discord developer portal " +
		"(Bot → Reset Token), not a webhook URL.",
});

// Signing members in (`notifications link`) needs the application's OAuth client secret, a third credential.
/** Resolves the Discord application's OAuth client secret used to sign members in, from `HOLOCRON_DISCORD_CLIENT_SECRET`, `DISCORD_CLIENT_SECRET` or the keyring. */
export const resolveClientSecret = createResolveToken({
	envName: "HOLOCRON_DISCORD_CLIENT_SECRET",
	vendorEnvName: "DISCORD_CLIENT_SECRET",
	keyringService: "discord.holonet.oauth",
	errorMessage:
		"no Discord client secret found. Set HOLOCRON_DISCORD_CLIENT_SECRET (or DISCORD_CLIENT_SECRET), or run: " +
		"holocron auth set discord.holonet.oauth <secret> — it is the client secret from the developer portal " +
		"(OAuth2 → Reset Secret), which the API cannot create or read.",
});

/**
 * Every token this plugin takes, for `holocron doctor tokens`. `verifyToken` checks a webhook URL, so the bot token and
 * the OAuth client secret are listed but not handed to it.
 */
export const tokens: PluginToken[] = [
	resolveToken.token,
	{ ...resolveBotToken.token, verifiable: false },
	{ ...resolveClientSecret.token, verifiable: false },
];
