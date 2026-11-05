import { type CommandEntry } from "../../../interactive-menu/command-registry/command-registry.type.js";

export const projectReconcileEntry: CommandEntry = {
	name: "project reconcile",
	description: "Set item statuses where a rule says so: blocked, unblocked, closed (status only)",
	positionals: [],
	options: [],
	supportsDryRun: true,
};
