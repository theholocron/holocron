import { type MenuEntry } from "@theholocron/kyber/menu";

export const migrateProjectEntry: MenuEntry = {
	name: "migrate project",
	description: "Move a board's issues to another tracker, with the board's status and priority",
	positionals: [{ key: "name", message: "Board to move (by name):", type: "input" }],
	options: [
		{
			key: "from",
			flag: "--from",
			type: "input",
			required: true,
			message: "Move it from (github, linear:team=ENG):",
		},
		{ key: "to", flag: "--to", type: "input", required: true, message: "Move it to:" },
		{
			key: "template",
			flag: "--template",
			type: "input",
			message: "Board template to make a missing board from (default roadmap):",
		},
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
	skipOptions: ["open-only", "milestone", "yes"],
	supportsDryRun: true,
};
