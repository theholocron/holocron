import { type CommandEntry } from "../../interactive-menu/command-registry/command-registry.type.js";

export const doctorSecretsEntry: CommandEntry = {
	name: "doctor secrets",
	description:
		"Check the secrets the config says must exist against the ones the provider holds (read-only, names only)",
	positionals: [],
	supportsDryRun: false,
};
