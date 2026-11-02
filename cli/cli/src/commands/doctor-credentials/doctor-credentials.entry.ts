import { type CommandEntry } from "../../interactive-menu/command-registry/command-registry.type.js";

export const doctorCredentialsEntry: CommandEntry = {
	name: "doctor credentials",
	description: "Check that the credentials environment exists and holds the tokens the plugins take (read-only)",
	positionals: [],
	supportsDryRun: false,
};
