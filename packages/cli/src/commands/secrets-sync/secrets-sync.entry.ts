import { type CommandEntry } from "../../interactive-menu/command-registry/command-registry.type.js";

export const secretsSyncEntry: CommandEntry = {
	name: "secrets sync",
	description: "Read a vault environment + fan KEY=VALUEs out to secrets + deployment env vars",
	positionals: [{ key: "environmentId", message: "Vault environment id:", type: "input" }],
	supportsDryRun: true,
};
