import { type MenuEntry } from "@theholocron/kyber/menu";

export const syncGithubEntry: MenuEntry = {
	name: "sync github",
	description: "Sync workflow templates and composite actions to theholocron/.github",
	positionals: [],
	supportsDryRun: true,
};
