import { type MenuEntry } from "@theholocron/kyber/menu";

export const monitoringCheckEntry: MenuEntry = {
	name: "check monitor",
	description: "Run every configured `monitoring` check against a given URL instead of its own configured url",
	positionals: [{ key: "url", message: "URL to test against:", type: "input" }],
	supportsDryRun: false,
};
