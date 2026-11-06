import { type MenuEntry } from "@theholocron/kyber/menu";

export const skillsInstallEntry: MenuEntry = {
	name: "skills install",
	description: "Copy skills from @theholocron/skills into .agents/ with agent symlinks",
	positionals: [],
	supportsDryRun: true,
};
