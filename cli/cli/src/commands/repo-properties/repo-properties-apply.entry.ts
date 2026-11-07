import { type MenuEntry } from "@theholocron/kyber/menu";

export const repoPropertiesApplyEntry: MenuEntry = {
	name: "repo properties apply",
	description: "Add the capabilities the organization's holocron_capabilities property does not allow yet",
	positionals: [],
	skipOptions: ["yes"],
	supportsDryRun: true,
};
