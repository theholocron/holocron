import { type CommandEntry } from "../../interactive-menu/command-registry/command-registry.type.js";

export const secretSetEntry: CommandEntry = {
	name: "secrets set",
	description: "Set a single secret via the configured `secrets` capability",
	positionals: [{ key: "name", message: "Secret name:", type: "input" }],
	supportsDryRun: true,
};
