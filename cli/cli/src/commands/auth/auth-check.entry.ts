import { listStoredProviders } from "../../auth/index.js";
import { type CommandEntry } from "../../interactive-menu/command-registry/command-registry.type.js";

export const authCheckEntry: CommandEntry = {
	name: "auth check",
	description: "Re-verify a stored bootstrap token",
	positionals: [{ key: "provider", message: "Provider:", type: "select", choices: listStoredProviders }],
};
