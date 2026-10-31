import { type CommandEntry } from "../../interactive-menu/command-registry/command-registry.type.js";

export const doctorVariablesEntry: CommandEntry = {
	name: "doctor variables",
	description: "Check the Actions variables the config declares against the ones the provider holds (read-only)",
	positionals: [],
	supportsDryRun: false,
};
