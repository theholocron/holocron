import { type CommandEntry } from "../../interactive-menu/command-registry/command-registry.type.js";

export const notificationsLinkEntry: CommandEntry = {
	name: "notifications link",
	description: "Link your server account to your GitHub account by signing in with the provider",
	positionals: [],
	options: [
		{
			key: "provider",
			flag: "--provider",
			type: "input",
			message: "Which notifications provider (blank = the only one that can sign members in):",
		},
	],
	supportsDryRun: true,
};
