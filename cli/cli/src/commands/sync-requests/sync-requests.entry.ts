import { type MenuEntry } from "@theholocron/kyber/menu";

export const syncRequestsEntry: MenuEntry = {
	name: "sync requests",
	description: "Keep each tooling provider's own workspace and the repo's request files in step, both ways",
	positionals: [],
	skipOptions: ["yes", "to", "check", "prefer"],
	supportsDryRun: true,
};
