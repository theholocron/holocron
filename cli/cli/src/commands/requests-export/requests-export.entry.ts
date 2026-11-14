import { type MenuEntry } from "@theholocron/kyber/menu";

export const requestsExportEntry: MenuEntry = {
	name: "export requests",
	description:
		"Write the repo's request collections in each tooling provider's own format, under a git-ignored folder",
	positionals: [],
	skipOptions: ["yes", "to", "out"],
	supportsDryRun: true,
};
