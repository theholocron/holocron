import { type CommandEntry } from "../../interactive-menu/command-registry/command-registry.type.js";

export const monitoringCheckEntry: CommandEntry = {
	name: "monitoring check",
	description: "Run every configured `monitoring` check against a given URL instead of its own configured url",
	positionals: [{ key: "url", message: "URL to test against:", type: "input" }],
	supportsDryRun: false,
};
