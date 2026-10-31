import { type CommandEntry } from "../../interactive-menu/command-registry/command-registry.type.js";

export const doctorEnvironmentsEntry: CommandEntry = {
	name: "doctor environments",
	description: "Check that the deployment environments the config relies on exist (read-only)",
	positionals: [],
	supportsDryRun: false,
};
