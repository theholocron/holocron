import { type CommandEntry } from "../../interactive-menu/command-registry/command-registry.type.js";

export const doctorProjectEntry: CommandEntry = {
	name: "doctor project",
	description:
		"Compare each declared project board with its template, and report items that need a status (read-only)",
	positionals: [],
	options: [
		{
			key: "post",
			flag: "--post",
			type: "confirm",
			default: false,
			message: "Post the result to #alerts (the failures, or just the summary)?",
		},
	],
	supportsDryRun: false,
};
