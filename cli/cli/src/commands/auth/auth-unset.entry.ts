import { listStoredProviders } from "../../auth/index.js";
import { type CommandEntry } from "../../interactive-menu/command-registry/command-registry.type.js";

export const authUnsetEntry: CommandEntry = {
	name: "auth unset",
	description: "Remove a stored bootstrap token",
	positionals: [{ key: "provider", message: "Provider:", type: "select", choices: listStoredProviders }],
};
