import { type MenuEntry } from "@theholocron/kyber/menu";

export const deployEntry: MenuEntry = {
	name: "deploy",
	description: "Trigger a deployment via the configured `deployment` capability",
	positionals: [{ key: "branch", message: "Branch to deploy:", type: "input" }],
	supportsDryRun: true,
};
