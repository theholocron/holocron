import { type MenuEntry } from "@theholocron/kyber/menu";

export const migrateIssuesEntry: MenuEntry = {
	name: "migrate issues",
	description: "Move every issue, a milestone or project's issues, or a list of keys from one tracker to another",
	positionals: [],
	options: [
		{
			key: "from",
			flag: "--from",
			type: "input",
			required: true,
			message: "Move them from (github, linear:team=ENG):",
		},
		{ key: "to", flag: "--to", type: "input", required: true, message: "Move them to:" },
		{ key: "all", flag: "--all", type: "confirm", message: "Every issue?" },
		{
			key: "sourceMilestone",
			flag: "--source-milestone",
			type: "input",
			message: "Only this milestone or project:",
		},
		{ key: "keys", flag: "--keys", type: "input", message: "Only these keys (#1,#2):" },
	],
	skipOptions: ["open-only", "milestone", "yes"],
	supportsDryRun: true,
};
