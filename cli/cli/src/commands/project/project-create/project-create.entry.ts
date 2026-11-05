import { type CommandEntry } from "../../../interactive-menu/command-registry/command-registry.type.js";

export const projectCreateEntry: CommandEntry = {
	name: "project create",
	description: "Make a board from a template",
	// The template is optional: a terminal run without one picks from a list inside the command.
	positionals: [],
	options: [{ key: "title", flag: "--title", type: "input", message: "Board title (blank = the template's name):" }],
	supportsDryRun: true,
};
