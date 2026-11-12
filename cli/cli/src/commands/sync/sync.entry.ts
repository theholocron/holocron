import { type MenuEntry } from "@theholocron/kyber/menu";

export const syncEntry: MenuEntry = {
	name: "sync",
	description:
		"Sync state from config to the provider and local files (labels, properties, teams, topics, keywords, description, homepage, readme, workflows, scripts, wiki)",
	positionals: [],
	supportsDryRun: true,
};
