import { type CommandEntry } from "../../interactive-menu/command-registry/command-registry.type.js";

export const syncReadmeEntry: CommandEntry = {
	name: "repo sync readme",
	description: "Sync the Installation + Usage block in README.md from package.json",
	positionals: [],
	supportsDryRun: true,
};
