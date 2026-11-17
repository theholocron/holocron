import { type MenuEntry } from "@theholocron/kyber/menu";

export const upgradeDepsEntry: MenuEntry = {
	name: "upgrade deps",
	description: "Bump every @theholocron/* pin to latest and migrate holocron.config.ts to the current preset API",
	positionals: [],
	options: [
		{
			key: "pinsOnly",
			flag: "--pins-only",
			type: "confirm",
			default: false,
			message: "Only bump the catalog pins, not holocron.config.ts?",
		},
	],
	supportsDryRun: true,
};
