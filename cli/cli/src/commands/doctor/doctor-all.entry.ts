import { type MenuEntry } from "@theholocron/kyber/menu";

export const doctorAllEntry: MenuEntry = {
	name: "doctor all",
	menuLabel: "doctor (everything)",
	description: "Run every deep check (doctor <capability>) and print one row each",
	positionals: [],
	supportsDryRun: false,
	spawnArgs: ["doctor", "--all"],
};
