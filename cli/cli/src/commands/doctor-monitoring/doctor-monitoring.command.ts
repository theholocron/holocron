import type { CommandModule } from "yargs";

import { applyResolvedConfig, type GlobalArgs, tokenContext } from "../../cli-support/index.js";
import { loadConfig } from "../../config/index.js";
import { runDoctorMonitoring } from "./doctor-monitoring.js";

export const doctorMonitoringCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "monitoring",
	describe: "Check the monitoring checks the config declares against the ones the provider holds (read-only)",
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const report = await runDoctorMonitoring({
			loaded,
			context: { repoRoot: argv.cwd, ...tokens },
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
