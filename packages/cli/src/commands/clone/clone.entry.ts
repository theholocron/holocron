import { type CommandEntry } from "../../interactive-menu/command-registry/command-registry.type.js";

export const cloneEntry: CommandEntry = {
	name: "clone",
	description: "Clone a single repo (org/repo) or every repo in an org (org)",
	positionals: [
		{
			key: "target",
			message: "org/repo to clone (or a bare org to clone every repo in it):",
			type: "input",
			validate: (v) => v.trim().length > 0 || "org/repo or org is required",
		},
	],
	supportsDryRun: true,
};
