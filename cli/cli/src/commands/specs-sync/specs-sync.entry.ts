import { type CommandEntry } from "../../interactive-menu/command-registry/command-registry.type.js";

export const specsSyncEntry: CommandEntry = {
	name: "specs sync",
	description: "Keep each ADR and spec in step with a post in a forum channel",
	positionals: [],
	options: [
		{
			key: "provider",
			flag: "--provider",
			type: "input",
			message: "Which notifications provider (blank = the only one that can keep discussion posts):",
		},
		{
			key: "channel",
			flag: "--channel",
			type: "input",
			message: "Which forum channel (blank = the only forum the layout declares):",
		},
		{
			key: "notify",
			flag: "--notify",
			type: "confirm",
			default: false,
			message: "Let new posts notify people (leave off for a backfill)?",
		},
	],
	supportsDryRun: true,
};
