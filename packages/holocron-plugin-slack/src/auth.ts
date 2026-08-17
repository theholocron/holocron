import { AuthError, createResolveToken, type ResolveTokenInput } from "@theholocron/cli";

export { AuthError };
export type { ResolveTokenInput };

export const resolveToken = createResolveToken({
	envName: "HOLOCRON_SLACK_TOKEN",
	vendorEnvName: "SLACK_BOT_TOKEN",
	keyringService: "slack",
	errorMessage:
		"no Slack bot token found. Pass --token <TOKEN>, set HOLOCRON_SLACK_TOKEN / SLACK_BOT_TOKEN, " +
		"or run: holocron auth set slack <xoxb-TOKEN>",
});
