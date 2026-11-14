import { type MenuEntry } from "@theholocron/kyber/menu";

export const syncToolingEntry: MenuEntry = {
	name: "sync tooling",
	description: "Sync each tooling provider (collections, environments, specs) without running the rest of setup",
	positionals: [],
	supportsDryRun: true,
};
