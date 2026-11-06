import { type MenuEntry } from "@theholocron/kyber/menu";

export const projectCreateEntry: MenuEntry = {
	name: "project create",
	description: "Make a board from a template",
	// The template is optional: a terminal run without one picks from a list inside the command.
	positionals: [],
	options: [{ key: "title", flag: "--title", type: "input", message: "Board title (blank = the template's name):" }],
	supportsDryRun: true,
};
