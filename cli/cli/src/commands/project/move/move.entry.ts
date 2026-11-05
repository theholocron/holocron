import { type CommandEntry } from "../../../interactive-menu/command-registry/command-registry.type.js";

export const projectMoveEntry: CommandEntry = {
	name: "project move",
	description: "Move the open items of one board to another, with their status and priority; closed ones stay behind",
	positionals: [
		{ key: "from", message: "Board to move the open items from:", type: "input" },
		{ key: "to", message: "Board to move them to:", type: "input" },
	],
	skipOptions: ["template", "yes"],
	supportsDryRun: true,
};
