import { type MenuEntry } from "@theholocron/kyber/menu";

export const projectReconcileEntry: MenuEntry = {
	name: "reconcile project",
	description: "Set item statuses where a rule says so: blocked, unblocked, closed (status only)",
	positionals: [],
	options: [],
	supportsDryRun: true,
};
