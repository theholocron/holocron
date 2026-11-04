import { type CommandEntry } from "../../interactive-menu/command-registry/command-registry.type.js";

export const doctorCiEntry: CommandEntry = {
	name: "doctor ci",
	description:
		"Check the repo against the flat task vocabulary: aliases, caller names, the ci aggregate, home (read-only)",
	positionals: [],
	supportsDryRun: false,
};
