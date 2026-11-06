import { type MenuEntry } from "@theholocron/kyber/menu";

export const doctorRepoEntry: MenuEntry = {
	name: "doctor repo",
	description:
		"Check the repository settings against the config (read-only): description, topics, labels, teams, protection, security",
	positionals: [],
	supportsDryRun: false,
};
