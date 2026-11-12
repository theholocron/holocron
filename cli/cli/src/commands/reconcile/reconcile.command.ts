import type { Argv, CommandModule } from "yargs";

import { type GlobalArgs } from "../global-args/index.js";
import { groupMenu } from "../group-menu/index.js";
import { projectReconcileCommand } from "../project/reconcile/reconcile.command.js";

export const reconcileCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "reconcile",
	describe: "Set project board item statuses where a rule says so",
	builder: (y: Argv<GlobalArgs>) =>
		y.command(projectReconcileCommand as never).command(groupMenu("reconcile") as never),
	handler: () => {},
};
