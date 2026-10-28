import { type CommandEntry } from "../../interactive-menu/command-registry/command-registry.type.js";

export const repoSyncEntry: CommandEntry = {
	name: "repo sync",
	description:
		"Sync state from config to the provider and local files (labels, properties, teams, topics, keywords, description, homepage, readme, workflows, scripts, wiki)",
	positionals: [],
	supportsDryRun: true,
};
