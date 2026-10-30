import { type CommandEntry } from "../../interactive-menu/command-registry/command-registry.type.js";

export const repoCleanupBranchesEntry: CommandEntry = {
	name: "repo cleanup branches",
	description: "Delete the local branches whose pull request is merged",
	positionals: [],
	options: [
		{
			key: "local",
			flag: "--local",
			type: "confirm",
			default: true,
			required: true,
			message: "Clean up the branches in this checkout?",
		},
		{
			key: "yes",
			flag: "--yes",
			type: "confirm",
			default: false,
			message: "Delete the merged ones (otherwise only list them)?",
		},
	],
	skipOptions: ["repo"],
	supportsDryRun: true,
};
