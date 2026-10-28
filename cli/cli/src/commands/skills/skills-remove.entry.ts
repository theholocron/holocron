import { type CommandEntry } from "../../interactive-menu/command-registry/command-registry.type.js";

export const skillsRemoveEntry: CommandEntry = {
	name: "skills remove",
	description: "Remove installed skills via npx skills remove",
	positionals: [],
	supportsDryRun: true,
};
