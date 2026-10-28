import type { Argv } from "yargs";

import type { GlobalArgs, InferArgs } from "../../cli-support/index.js";

export const notificationsChannelAddArgs = (y: Argv<GlobalArgs>) =>
	y
		.positional("name", {
			type: "string",
			describe: "Channel name (e.g. alerts)",
		})
		.option("category", {
			type: "string",
			describe: "Put the channel under this category (created if missing)",
		})
		.option("topic", { type: "string", describe: "Channel topic" })
		.option("with-webhook", {
			type: "boolean",
			default: false,
			describe: "Also create a webhook and store its URL as a secret (the URL is never printed)",
		})
		.option("webhook-name", {
			type: "string",
			describe: "Webhook display name (default: the channel name)",
		})
		.option("secret", {
			type: "string",
			describe: "Secret to store the URL in (default: HOLOCRON_NOTIFY_WEBHOOK_<CHANNEL>)",
		})
		.option("scope", {
			type: "string",
			describe: 'Secret scope: "repo", "env=<name>" or "org=<name>" (default: the org)',
		})
		.option("provider", {
			type: "string",
			describe: "Which notifications provider, when several can provision",
		});

export type NotificationsChannelAddArgs = InferArgs<typeof notificationsChannelAddArgs>;
