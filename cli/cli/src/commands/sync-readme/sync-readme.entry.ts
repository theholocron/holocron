import { type MenuEntry } from "@theholocron/kyber/menu";

export const syncReadmeEntry: MenuEntry = {
	name: "repo sync readme",
	description: "Sync the Installation + Usage block in README.md from package.json",
	positionals: [],
	supportsDryRun: true,
};
