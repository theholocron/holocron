import { type MenuEntry } from "@theholocron/kyber/menu";

export const projectCloseEntry: MenuEntry = {
	name: "close project",
	description: "Close a board (reversible)",
	positionals: [{ key: "board", message: "Board number or name:", type: "input" }],
	options: [{ key: "yes", flag: "--yes", type: "confirm", message: "Close without asking?" }],
	supportsDryRun: true,
};
