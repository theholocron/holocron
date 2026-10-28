import type { CommandModule } from "yargs";

import { applyResolvedConfig } from "../../cli-support/index.js";
import { loadConfig } from "../../config/index.js";
import { reportError } from "../../observability/logger/index.js";
import type { RepoSyncArgs } from "../repo/repo-sync.args.js";
import { runSyncReadme } from "./index.js";
import { type SyncReadmeArgs, syncReadmeArgs } from "./sync-readme.args.js";

export const syncReadmeCommand: CommandModule<RepoSyncArgs, SyncReadmeArgs> = {
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
			if (report.message) reportError(`repo sync readme: ${report.message}`);
			process.exitCode = 1;
		}
	},
};
