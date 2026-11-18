import { type MenuEntry } from "@theholocron/kyber/menu";

export const doctorWikiEntry: MenuEntry = {
	name: "doctor wiki",
	description: "Check the wiki's organization, docs site, domain and published pages (read-only)",
	positionals: [],
	skipOptions: ["all", "repo"],
	supportsDryRun: false,
};
