import { type MenuEntry } from "@theholocron/kyber/menu";

export const doctorVariablesEntry: MenuEntry = {
	name: "doctor variables",
	description: "Check the Actions variables the config declares against the ones the provider holds (read-only)",
	positionals: [],
	supportsDryRun: false,
};
