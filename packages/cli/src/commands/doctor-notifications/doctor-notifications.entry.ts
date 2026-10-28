import { type CommandEntry } from "../../interactive-menu/command-registry/command-registry.type.js";

export const doctorNotificationsEntry: CommandEntry = {
	name: "doctor notifications",
	description:
		"Check the layout against the server and the secrets store, step by step (a full run leaves one test post in the test channel; --built-only posts nothing unless --deliver)",
	positionals: [],
	options: [
		{
			key: "deliver",
			flag: "--deliver",
			type: "confirm",
			default: false,
			message: "Post a test message through every channel's webhook (each removes itself)?",
		},
	],
	supportsDryRun: false,
};
