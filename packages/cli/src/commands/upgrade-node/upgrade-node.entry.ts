import { type CommandEntry } from "../../interactive-menu/command-registry/command-registry.type.js";
import { numeric } from "../../interactive-menu/command-registry/validators.js";

export const upgradeNodeEntry: CommandEntry = {
	name: "repo upgrade node",
	description: "Scan the repo and update every Node.js version pin to a new major",
	positionals: [{ key: "to", message: "Target Node.js major version:", type: "input", validate: numeric }],
	supportsDryRun: true,
};
