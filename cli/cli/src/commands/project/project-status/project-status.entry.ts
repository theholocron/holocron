import { type MenuEntry } from "@theholocron/kyber/menu";

export const projectStatusEntry: MenuEntry = {
	name: "project status",
	description: "Set the status of an issue on the project board, by the issue's key",
	positionals: [
		{ key: "issue", message: "Issue (#1234, owner/repo#1234 or the tracker's key):", type: "input" },
		{ key: "status", message: "Status (a name from the board's template):", type: "input" },
	],
	options: [{ key: "board", flag: "--board", type: "input", message: "Board name (blank = the first declared):" }],
	supportsDryRun: true,
};
