import { type CommandEntry } from "../../interactive-menu/command-registry/command-registry.type.js";

export const doctorDnsEntry: CommandEntry = {
	name: "doctor dns",
	description:
		"Check that the DNS records the config makes setup write exist and point where they should (read-only)",
	positionals: [],
	supportsDryRun: false,
};
