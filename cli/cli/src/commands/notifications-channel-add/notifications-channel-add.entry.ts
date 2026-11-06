import { type MenuEntry } from "@theholocron/kyber/menu";

export const notificationsChannelAddEntry: MenuEntry = {
	name: "notifications channel add",
	description: "Create a notification channel, optionally with a webhook whose URL is stored as a secret",
	positionals: [{ key: "name", message: "Channel name:", type: "input" }],
	supportsDryRun: true,
};
