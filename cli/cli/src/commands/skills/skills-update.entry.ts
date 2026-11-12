import { type MenuEntry } from "@theholocron/kyber/menu";

export const skillsUpdateEntry: MenuEntry = {
	name: "update skills",
	description: "Update installed skills to their latest upstream versions via npx skills update",
	positionals: [],
	supportsDryRun: true,
};
