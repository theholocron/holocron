import { type MenuEntry } from "@theholocron/kyber/menu";

/** The options of `probe`: each probe that takes one asks for it itself, so the menu offers none (the probe menu entries share this). */
export const PROBE_SKIP_OPTIONS = ["lcov", "warn", "files", "only", "copy", "environment", "yes"];

export const probeEntry: MenuEntry = {
	name: "probe",
	description: "Poke a live provider on purpose: inspect it, or run a proof that cleans up after itself",
	positionals: [],
	// Opens a menu of its own, and each probe that changes things previews and confirms itself.
	opensMenu: true,
	skipOptions: PROBE_SKIP_OPTIONS,
};
