import { type MenuEntry } from "@theholocron/kyber/menu";

export const setupEntry: MenuEntry = {
	name: "repo setup",
	description: "Apply infra setup actions across every configured capability",
	positionals: [],
	supportsDryRun: true,
};
