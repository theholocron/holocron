import { type MenuEntry } from "@theholocron/kyber/menu";

export const specsSyncEntry: MenuEntry = {
	name: "specs sync",
	description: "Keep each ADR and spec in step with a post in a forum channel",
	positionals: [],
	options: [
		{
			key: "provider",
			flag: "--provider",
			type: "input",
			message: "Which notifications provider (blank = the only one that can keep discussion posts):",
		},
		{
			key: "channel",
			flag: "--channel",
			type: "input",
			message: "Which forum channel (blank = the only forum the layout declares):",
		},
		{
			key: "files",
			flag: "--files",
			type: "input",
			message: "Only these files (blank = every ADR and spec):",
		},
		{
			key: "pr",
			flag: "--pr",
			type: "input",
			message: "Name this pull request on the posts (blank = the one each file's history names):",
		},
		{
			key: "refreshOrigin",
			flag: "--refresh-origin",
			type: "confirm",
			default: false,
			message:
				"Rewrite the PR line of existing posts to what the current rule names (a repair; no other change)?",
		},
		{
			key: "refreshTitles",
			flag: "--refresh-titles",
			type: "confirm",
			default: false,
			message: "Rename existing posts to the title the current rule writes (a repair; no other change)?",
		},
		{
			key: "refresh",
			flag: "--refresh",
			type: "confirm",
			default: false,
			message: "Repair existing posts: PR line, title and id link in one pass (no other change)?",
		},
		{
			key: "withdraw",
			flag: "--withdraw",
			type: "confirm",
			default: false,
			message: "Withdraw the posts of these files (a pull request closed without merging)?",
		},
		{
			key: "notify",
			flag: "--notify",
			type: "confirm",
			default: false,
			message: "Let new posts notify people (leave off for a backfill)?",
		},
	],
	supportsDryRun: true,
};
