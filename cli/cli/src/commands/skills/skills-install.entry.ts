import { type CommandEntry } from "../../interactive-menu/command-registry/command-registry.type.js";

export const skillsInstallEntry: CommandEntry = {
	name: "skills install",
	description: "Copy skills from @theholocron/skills into .agents/ with agent symlinks",
	positionals: [],
	supportsDryRun: true,
};
