import { type CommandEntry } from "../../interactive-menu/command-registry/command-registry.type.js";

export const authExportEntry: CommandEntry = {
	name: "auth export",
	description:
		"Write the stored tokens as NAME=value lines to a private file, to import them into a credentials environment",
	positionals: [],
	supportsDryRun: false,
};
