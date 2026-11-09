import { type MenuEntry } from "@theholocron/kyber/menu";

export const ideasSyncEntry: MenuEntry = {
	name: "ideas sync",
	description: "File the idea notes that are ready as issues and record the issue in each note",
	positionals: [],
	skipOptions: ["yes"],
	supportsDryRun: true,
};
