import { type MenuEntry } from "@theholocron/kyber/menu";

export const notificationsChannelAddEntry: MenuEntry = {
	name: "new channel",
	description: "Create a notification channel, optionally with a webhook whose URL is stored as a secret",
	positionals: [{ key: "name", message: "Channel name:", type: "input" }],
	options: [
		{
			key: "category",
			flag: "--category",
			type: "input",
			message: "Put the channel under this category (created if missing):",
		},
		{
			key: "topic",
			flag: "--topic",
			type: "input",
			message: "Channel topic:",
		},
		{
			key: "withWebhook",
			flag: "--with-webhook",
			type: "confirm",
			default: false,
			message: "Also create a webhook and store its URL as a secret?",
		},
	],
	skipOptions: ["webhook-name", "secret", "scope", "provider"],
	supportsDryRun: true,
};
