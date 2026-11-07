import { type MenuEntry } from "@theholocron/kyber/menu";

export const migrateIssueEntry: MenuEntry = {
	name: "migrate issue",
	description: "Move one issue from one tracker to another, with its comments, labels and priority",
	positionals: [{ key: "key", message: "Issue to move (#42, ENG-42):", type: "input" }],
	options: [
		{
			key: "from",
			flag: "--from",
			type: "input",
			required: true,
			message: "Move it from (github, linear:team=ENG):",
		},
		{ key: "to", flag: "--to", type: "input", required: true, message: "Move it to:" },
	],
	skipOptions: ["open-only", "milestone", "yes"],
	supportsDryRun: true,
};
