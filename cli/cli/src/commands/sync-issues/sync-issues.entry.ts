import { type MenuEntry } from "@theholocron/kyber/menu";

export const syncIssuesEntry: MenuEntry = {
	name: "sync issues",
	description: "Keep one tracker's issues up to date from another, one direction (GitHub and Linear)",
	positionals: [],
	options: [
		{
			key: "from",
			flag: "--from",
			type: "input",
			required: true,
			message: "Read the issues from (github, linear:team=ENG):",
		},
		{ key: "to", flag: "--to", type: "input", required: true, message: "Write them to:" },
		{ key: "since", flag: "--since", type: "input", message: "Only issues changed since (7d, 2026-03-01):" },
		{
			key: "limit",
			flag: "--limit",
			type: "input",
			message: "Read at most this many issues (a trial run):",
		},
		{
			key: "order",
			flag: "--order",
			type: "select",
			choices: ["oldest", "newest"],
			default: "oldest",
			message: "Which end of the creation order:",
		},
	],
	skipOptions: ["yes"],
	supportsDryRun: true,
};
