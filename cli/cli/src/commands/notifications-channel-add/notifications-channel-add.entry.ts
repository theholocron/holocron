import { type CommandEntry } from "../../interactive-menu/command-registry/command-registry.type.js";

export const notificationsChannelAddEntry: CommandEntry = {
	name: "notifications channel add",
	description: "Create a notification channel, optionally with a webhook whose URL is stored as a secret",
	positionals: [{ key: "name", message: "Channel name:", type: "input" }],
	supportsDryRun: true,
};
