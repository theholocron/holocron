import { type CommandEntry } from "../../interactive-menu/command-registry/command-registry.type.js";

export const doctorEntry: CommandEntry = {
	name: "doctor",
	description: "Load the config and run a smoke check against every provider",
	positionals: [],
	supportsDryRun: true,
};
