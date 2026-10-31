import { type CommandEntry } from "../../interactive-menu/command-registry/command-registry.type.js";

export const doctorTokensEntry: CommandEntry = {
	name: "doctor tokens",
	description:
		"Check that each token a configured plugin takes is set and still accepted (read-only; no token is printed)",
	positionals: [],
	supportsDryRun: false,
};
