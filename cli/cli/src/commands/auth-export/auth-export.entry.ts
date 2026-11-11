import { type MenuEntry } from "@theholocron/kyber/menu";

export const authExportEntry: MenuEntry = {
	name: "export tokens",
	description:
		"Write the stored tokens as NAME=value lines to a private file, to import them into a credentials environment",
	positionals: [],
	supportsDryRun: false,
};
