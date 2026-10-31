import { type CommandEntry } from "../../interactive-menu/command-registry/command-registry.type.js";

export const repoCleanupBranchesEntry: CommandEntry = {
	name: "repo cleanup branches",
	description: "List the branches whose pull request is merged and delete the ones you pick",
	positionals: [],
	options: [
		{
			key: "local",
			flag: "--local",
			type: "confirm",
			default: false,
			message: "Only the branches in this checkout?",
		},
		{
			key: "remote",
			flag: "--remote",
			type: "confirm",
			default: false,
			message: "Only the branches on the remote?",
		},
	],
	skipOptions: ["yes", "repo"],
	// The command lists first and asks before it deletes, so the menu's own dry-run round would show the list twice.
	supportsDryRun: false,
};
