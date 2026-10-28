import { type CommandEntry } from "../../interactive-menu/command-registry/command-registry.type.js";

export const deployEntry: CommandEntry = {
	name: "deploy",
	description: "Trigger a deployment via the configured `deployment` capability",
	positionals: [{ key: "branch", message: "Branch to deploy:", type: "input" }],
	supportsDryRun: true,
};
