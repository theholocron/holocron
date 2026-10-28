import { type CommandEntry } from "../../interactive-menu/command-registry/command-registry.type.js";

export const deployOnReleaseEntry: CommandEntry = {
	name: "deploy on-release",
	description: "Deploy every workspace package whose delivery.deploy task is `on: release`",
	positionals: [],
	supportsDryRun: true,
};
