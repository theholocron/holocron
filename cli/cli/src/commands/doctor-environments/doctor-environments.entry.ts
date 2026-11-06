import { type MenuEntry } from "@theholocron/kyber/menu";

export const doctorEnvironmentsEntry: MenuEntry = {
	name: "doctor environments",
	description: "Check that the deployment environments the config relies on exist (read-only)",
	positionals: [],
	supportsDryRun: false,
};
