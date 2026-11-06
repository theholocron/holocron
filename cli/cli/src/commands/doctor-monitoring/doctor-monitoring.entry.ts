import { type MenuEntry } from "@theholocron/kyber/menu";

export const doctorMonitoringEntry: MenuEntry = {
	name: "doctor monitoring",
	description: "Check the monitoring checks the config declares against the ones the provider holds (read-only)",
	positionals: [],
	supportsDryRun: false,
};
