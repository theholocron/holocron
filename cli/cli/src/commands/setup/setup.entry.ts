import { type CommandEntry } from "../../interactive-menu/command-registry/command-registry.type.js";

export const setupEntry: CommandEntry = {
	name: "repo setup",
	description: "Apply infra setup actions across every configured capability",
	positionals: [],
	supportsDryRun: true,
};
