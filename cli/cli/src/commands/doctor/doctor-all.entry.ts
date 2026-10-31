import { type CommandEntry } from "../../interactive-menu/command-registry/command-registry.type.js";

export const doctorAllEntry: CommandEntry = {
	name: "doctor all",
	menuLabel: "doctor (everything)",
	description: "Run every deep check (doctor <capability>) and print one row each",
	positionals: [],
	supportsDryRun: false,
	spawnArgs: ["doctor", "--all"],
};
