import { type CommandEntry } from "../../interactive-menu/command-registry/command-registry.type.js";

export const doctorRepoEntry: CommandEntry = {
	name: "doctor repo",
	description:
		"Check the repository settings against the config (read-only): description, topics, labels, teams, protection, security",
	positionals: [],
	supportsDryRun: false,
};
