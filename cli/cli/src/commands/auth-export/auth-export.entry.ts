import { type CommandEntry } from "../../interactive-menu/command-registry/command-registry.type.js";

export const authExportEntry: CommandEntry = {
	name: "auth export",
	description: "Copy the stored tokens as NAME=value lines, to move them into a credentials environment",
	positionals: [],
	supportsDryRun: false,
};
