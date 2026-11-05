import { type CommandEntry } from "../../../interactive-menu/command-registry/command-registry.type.js";

export const projectCloseEntry: CommandEntry = {
	name: "project close",
	description: "Close a board (reversible)",
	positionals: [{ key: "board", message: "Board number or name:", type: "input" }],
	options: [{ key: "yes", flag: "--yes", type: "confirm", message: "Close without asking?" }],
	supportsDryRun: true,
};
