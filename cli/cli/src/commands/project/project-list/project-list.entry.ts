import { type CommandEntry } from "../../../interactive-menu/command-registry/command-registry.type.js";

export const projectListEntry: CommandEntry = {
	name: "project list",
	description: "List the boards of the organization, with their number, name and state",
	positionals: [],
};
