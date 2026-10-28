import { type CommandEntry } from "../../interactive-menu/command-registry/command-registry.type.js";

export const authListEntry: CommandEntry = {
	name: "auth list",
	description: "List every provider with a stored bootstrap token",
	positionals: [],
};
