import { type MenuEntry } from "@theholocron/kyber/menu";

export const setupEntry: MenuEntry = {
	name: "setup",
	description: "Apply infra setup actions across every configured capability",
	positionals: [],
	supportsDryRun: true,
};
