import type { Argv, CommandModule } from "yargs";

import { type GlobalArgs, groupMenu } from "../../cli-support/index.js";
import { monitoringCheckCommand } from "../monitoring-check/monitoring-check.command.js";
import { monitoringResolveChecksCommand } from "../monitoring-resolve-checks/monitoring-resolve-checks.command.js";
import { monitoringRunResolvedCommand } from "../monitoring-run-resolved/monitoring-run-resolved.command.js";

export const monitoringCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "monitoring",
	describe: "Run monitoring checks ad hoc, outside the configured provider",
	builder: (y: Argv<GlobalArgs>) =>
		y
			.command(monitoringCheckCommand as never)
			.command(monitoringResolveChecksCommand as never)
			.command(monitoringRunResolvedCommand as never)
			.command(groupMenu("monitoring") as never),
	handler: () => {},
};
