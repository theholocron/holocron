import { type MenuEntry } from "@theholocron/kyber/menu";

export const syncRequestsEntry: MenuEntry = {
	name: "sync requests",
	description:
		"Keep each tooling provider's own workspace of the repo's request collections equal to the request files",
	positionals: [],
	skipOptions: ["yes", "to", "check"],
	supportsDryRun: true,
};
