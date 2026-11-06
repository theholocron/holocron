import { type MenuEntry } from "@theholocron/kyber/menu";

export const doctorEntry: MenuEntry = {
	name: "doctor",
	description: "Load the config and run a smoke check against every provider",
	positionals: [],
	supportsDryRun: true,
};
