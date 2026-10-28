import { type CommandEntry } from "../../interactive-menu/command-registry/command-registry.type.js";

export const notificationsCreateServerEntry: CommandEntry = {
	name: "notifications create-server",
	description: "Create the server the layout describes, apply it, invite its owner and hand it over",
	positionals: [],
	options: [
		{
			key: "name",
			flag: "--name",
			type: "input",
			message: "What the new server is called (blank when resuming):",
		},
		{
			key: "owner",
			flag: "--owner",
			type: "input",
			required: true,
			message: "Member id of the person who will own it:",
		},
		{
			key: "force",
			flag: "--force",
			type: "confirm",
			default: false,
			message: "The config already names a server: create another and replace its id?",
		},
		{
			key: "resume",
			flag: "--resume",
			type: "confirm",
			default: false,
			message: "Finish an earlier run (the server exists): invite the owner and hand it over?",
		},
	],
	supportsDryRun: true,
};
