import { type MenuEntry } from "@theholocron/kyber/menu";

export const upgradeDepsEntry: MenuEntry = {
	name: "upgrade deps",
	description: "Bump every @theholocron/* pin to latest and migrate holocron.config.ts to the current preset API",
	positionals: [],
	supportsDryRun: true,
};
