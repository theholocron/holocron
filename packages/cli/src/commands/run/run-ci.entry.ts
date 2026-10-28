import { type CommandEntry } from "../../interactive-menu/command-registry/command-registry.type.js";

export const runCiEntry: CommandEntry = {
	name: "run ci",
	description: "Run the merge-gating checks locally, in CI order — 'will CI pass?'",
	positionals: [],
	supportsDryRun: true,
};
