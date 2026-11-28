import type { Argv, CommandModule } from "yargs";

import { type GlobalArgs } from "../global-args/index.js";
import { groupMenu } from "../group-menu/index.js";
import { monitoringResolveChecksCommand } from "../monitoring-resolve-checks/monitoring-resolve-checks.command.js";

export const resolveCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "resolve",
	describe: "Resolve configuration into a file for a later, trusted step",
	builder: (y: Argv<GlobalArgs>) =>
		y.command(monitoringResolveChecksCommand as never).command(groupMenu("resolve") as never),
	handler: () => {},
};
