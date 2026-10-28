import { type CommandEntry } from "../../interactive-menu/command-registry/command-registry.type.js";

export const skillsUpdateEntry: CommandEntry = {
	name: "skills update",
	description: "Update installed skills to their latest upstream versions via npx skills update",
	positionals: [],
	supportsDryRun: true,
};
