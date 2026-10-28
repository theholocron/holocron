import { type CommandEntry } from "../../interactive-menu/command-registry/command-registry.type.js";

export const probeEntry: CommandEntry = {
	name: "probe",
	description: "Poke a live provider on purpose: inspect it, or run a proof that cleans up after itself",
	positionals: [],
	// Opens a menu of its own, and each probe that changes things previews and confirms itself.
	opensMenu: true,
};
