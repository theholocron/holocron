import { type CommandEntry } from "../../interactive-menu/command-registry/command-registry.type.js";

export const syncGithubEntry: CommandEntry = {
	name: "sync github",
	description: "Sync workflow templates and composite actions to theholocron/.github",
	positionals: [],
	supportsDryRun: true,
};
