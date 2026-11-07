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
	],
	skipOptions: ["open-only", "milestone", "yes"],
	supportsDryRun: true,
};
