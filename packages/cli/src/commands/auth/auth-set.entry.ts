import { type CommandEntry } from "../../interactive-menu/command-registry/command-registry.type.js";

export const authSetEntry: CommandEntry = {
	name: "auth set",
	description: "Verify + store a bootstrap token for a provider",
	positionals: [{ key: "provider", message: "Provider name:", type: "input" }],
};
