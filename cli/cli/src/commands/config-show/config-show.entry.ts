import { type CommandEntry } from "../../interactive-menu/command-registry/command-registry.type.js";

export const configShowEntry: CommandEntry = {
	name: "config show",
	description: "Print the resolved holocron config",
	positionals: [],
};
