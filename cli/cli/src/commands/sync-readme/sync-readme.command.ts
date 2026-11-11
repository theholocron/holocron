import type { CommandModule } from "yargs";

import { loadConfig } from "../../config/index.js";
import { reportError } from "../../observability/logger/index.js";
import { applyResolvedConfig } from "../apply-resolved-config/index.js";
import type { SyncArgs } from "../sync/sync.args.js";
import { runSyncReadme } from "./index.js";
import { type SyncReadmeArgs, syncReadmeArgs } from "./sync-readme.args.js";

export const syncReadmeCommand: CommandModule<SyncArgs, SyncReadmeArgs> = {
	command: "readme",
	describe: "Sync the Installation + Usage block in README.md from package.json",
	builder: syncReadmeArgs,
	handler: async (argv) => {
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const report = await runSyncReadme({
			loaded,
			context: { repoRoot: argv.cwd, dryRun: argv.dryRun },
		});
		if (report.status === "fail") {
			if (report.message) reportError(`sync readme: ${report.message}`);
			process.exitCode = 1;
		}
	},
};
