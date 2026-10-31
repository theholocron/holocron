import { AuthError, createResolveToken, type PluginToken, type ResolveTokenInput } from "@theholocron/cli";

export { AuthError };
export type { ResolveTokenInput };

/** Resolves the Slack bot token from `--token`, `HOLOCRON_SLACK_TOKEN`, `SLACK_BOT_TOKEN` or the keyring entry for `slack`, and throws `AuthError` when none is set. */
export const resolveToken = createResolveToken({
	envName: "HOLOCRON_SLACK_TOKEN",
	vendorEnvName: "SLACK_BOT_TOKEN",
	keyringService: "slack",
	errorMessage:
		"no Slack bot token found. Pass --token <TOKEN>, set HOLOCRON_SLACK_TOKEN / SLACK_BOT_TOKEN, " +
		"or run: holocron auth set slack <xoxb-TOKEN>",
});

/** Every token this plugin takes, for `holocron doctor tokens`. */
export const tokens: PluginToken[] = [resolveToken.token];
