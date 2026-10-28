import { type CommandEntry } from "../../interactive-menu/command-registry/command-registry.type.js";

export const upgradeDepsEntry: CommandEntry = {
	name: "repo upgrade deps",
	description: "Bump every @theholocron/* pin to latest and migrate holocron.config.ts to the current preset API",
	positionals: [],
	supportsDryRun: true,
};
