import { type MenuEntry } from "@theholocron/kyber/menu";

export const syncIncidentsEntry: MenuEntry = {
	name: "sync incidents",
	description: "Mirror a status page's incidents into a Discord forum, one post each",
	positionals: [],
	options: [
		{
			key: "since",
			flag: "--since",
			type: "input",
			message: "Also read incidents resolved since (2d, 2026-03-01):",
		},
	],
	skipOptions: ["provider", "yes"],
	supportsDryRun: true,
};
