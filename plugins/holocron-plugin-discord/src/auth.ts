import { AuthError, createResolveToken, type ResolveTokenInput } from "@theholocron/cli";

export { AuthError };
export type { ResolveTokenInput };

// For Discord, the "token" stored in the keyring is the full webhook URL.
export const resolveToken = createResolveToken({
	envName: "HOLOCRON_DISCORD_WEBHOOK",
	vendorEnvName: "DISCORD_WEBHOOK_URL",
	keyringService: "discord",
	errorMessage:
		"no Discord webhook URL found. Pass --token <WEBHOOK_URL>, set HOLOCRON_DISCORD_WEBHOOK / DISCORD_WEBHOOK_URL, " +
		"or run: holocron auth set discord <https://discord.com/api/webhooks/...>",
});
