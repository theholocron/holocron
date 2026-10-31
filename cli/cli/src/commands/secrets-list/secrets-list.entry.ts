import { type CommandEntry } from "../../interactive-menu/command-registry/command-registry.type.js";

export const secretsListEntry: CommandEntry = {
	name: "secrets list",
	description: "List the names of the secrets at each scope (never the values)",
	positionals: [],
	supportsDryRun: false,
};
