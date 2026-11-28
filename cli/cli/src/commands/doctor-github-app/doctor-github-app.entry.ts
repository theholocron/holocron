import { type MenuEntry } from "@theholocron/kyber/menu";

export const doctorGitHubAppEntry: MenuEntry = {
	name: "doctor github-app",
	description:
		"Compare each registered GitHub App's events, permissions and installations with its manifest (read-only)",
	positionals: [],
	skipOptions: ["all", "repo"],
	supportsDryRun: false,
};
