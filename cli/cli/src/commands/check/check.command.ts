import type { Argv, CommandModule } from "yargs";

import { authCheckCommand } from "../auth/auth-check.command.js";
import { type GlobalArgs } from "../global-args/index.js";
import { groupMenu } from "../group-menu/index.js";
import { monitoringCheckCommand } from "../monitoring-check/monitoring-check.command.js";
import { monitoringRunResolvedCommand } from "../monitoring-run-resolved/monitoring-run-resolved.command.js";

export const checkCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "check",
	describe: "Check a stored token, or run monitoring checks against a URL",
	builder: (y: Argv<GlobalArgs>) =>
		y
			.command(authCheckCommand as never)
			.command(monitoringCheckCommand as never)
			.command(monitoringRunResolvedCommand as never)
			.command(groupMenu("check") as never),
	handler: () => {},
};
