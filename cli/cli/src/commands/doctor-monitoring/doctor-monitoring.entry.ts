import { type CommandEntry } from "../../interactive-menu/command-registry/command-registry.type.js";

export const doctorMonitoringEntry: CommandEntry = {
	name: "doctor monitoring",
	description: "Check the monitoring checks the config declares against the ones the provider holds (read-only)",
	positionals: [],
	supportsDryRun: false,
};
