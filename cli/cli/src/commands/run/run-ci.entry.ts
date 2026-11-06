import { type MenuEntry } from "@theholocron/kyber/menu";

export const runCiEntry: MenuEntry = {
	name: "run ci",
	description: "Run the merge-gating checks locally, in CI order — 'will CI pass?'",
	positionals: [],
	supportsDryRun: true,
};
