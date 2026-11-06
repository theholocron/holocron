import { type MenuEntry } from "@theholocron/kyber/menu";

export const deployOnReleaseEntry: MenuEntry = {
	name: "deploy on-release",
	description: "Deploy every workspace package whose delivery.deploy task is `on: release`",
	positionals: [],
	supportsDryRun: true,
};
