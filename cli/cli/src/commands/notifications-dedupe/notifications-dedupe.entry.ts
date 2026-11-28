import { type MenuEntry } from "@theholocron/kyber/menu";

export const notificationsDedupeEntry: MenuEntry = {
	name: "cleanup posts",
	description: "Delete the extra posts of a forum that has more than one post for the same key",
	positionals: [],
	skipOptions: ["yes", "provider"],
	supportsDryRun: true,
};
