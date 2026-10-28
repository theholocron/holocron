import type { CommandModule } from "yargs";

import { applyResolvedConfig, resolveOrg, tokenContext } from "../../cli-support/index.js";
import { type GlobalArgs } from "../../cli-support/index.js";
import { loadConfig } from "../../config/index.js";
import { runMonitoringResolveChecks } from "./index.js";
import { type MonitoringResolveChecksArgs, monitoringResolveChecksArgs } from "./monitoring-resolve-checks.args.js";

export const monitoringResolveChecksCommand: CommandModule<GlobalArgs, MonitoringResolveChecksArgs> = {
	command: "resolve-checks",
	describe:
		"Load config/plugins and write the configured `monitoring` checks to a file as JSON — the untrusted half of the delivery.previewCheck split (holocron#1030/#1032)",
	builder: monitoringResolveChecksArgs,
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		await runMonitoringResolveChecks({
			loaded,
			context: {
				repoRoot: argv.cwd,
				dryRun: argv.dryRun,
				...tokens,
				org: resolveOrg(argv, loaded.resolved),
			},
			outFile: argv.out as string,
		});
	},
};
