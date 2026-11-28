import { type MenuEntry } from "@theholocron/kyber/menu";

export const closeWorkEntry: MenuEntry = {
	name: "close work",
	description:
		"Close out a piece of work: mark its pull request ready when the checks are green, clean up after the merge, or abandon it",
	positionals: [{ key: "issue", message: "Issue (#1234, owner/repo#1234 or the tracker's key):", type: "input" }],
	options: [
		{ key: "wait", flag: "--wait", type: "confirm", message: "Wait for the checks to finish?" },
		{ key: "abandon", flag: "--abandon", type: "confirm", message: "Abandon the work instead?" },
		{ key: "keepWorktree", flag: "--keep-worktree", type: "confirm", message: "Keep the worktree?" },
	],
	skipOptions: ["yes", "timeout", "pr"],
	supportsDryRun: true,
};
