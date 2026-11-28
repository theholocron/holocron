import { type MenuEntry } from "@theholocron/kyber/menu";

export const skillsInstallEntry: MenuEntry = {
	name: "install skills",
	description: "Copy skills from @theholocron/skills into .agents/ with agent symlinks",
	positionals: [],
	supportsDryRun: true,
};
