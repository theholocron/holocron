import { type MenuEntry } from "@theholocron/kyber/menu";

export const repoSyncEntry: MenuEntry = {
	name: "repo sync",
	description:
		"Sync state from config to the provider and local files (labels, properties, teams, topics, keywords, description, homepage, readme, workflows, scripts, wiki)",
	positionals: [],
	supportsDryRun: true,
};
