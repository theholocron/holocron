import type { Argv, CommandModule } from "yargs";

import { applyResolvedConfig, resolveOrg, tokenContext } from "../../cli-support/index.js";
import { type GlobalArgs } from "../../cli-support/index.js";
import { loadConfig } from "../../config/index.js";
import { runSync } from "../sync/index.js";
import { syncReadmeCommand } from "../sync-readme/sync-readme.command.js";
import { type RepoSyncArgs, repoSyncArgs } from "./repo-sync.args.js";

export const repoSyncCommand: CommandModule<GlobalArgs, RepoSyncArgs> = {
	command: "sync [steps..]",
	describe:
		"Sync state from config to the provider and local files (labels, properties, teams, topics, keywords, description, homepage, readme, workflows, scripts, wiki)",
	builder: (y: Argv<GlobalArgs>) => repoSyncArgs(y).command(syncReadmeCommand as never),
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const report = await runSync({
			loaded,
			context: {
				repoRoot: argv.cwd,
				dryRun: argv.dryRun,
				...(argv.repo ? { repo: argv.repo } : {}),
				...tokens,
				org: resolveOrg(argv, loaded.resolved),
			},
			...(argv.steps && argv.steps.length > 0 ? { steps: argv.steps as string[] } : {}),
		});
		if (report.summary.fail > 0) {
			process.exitCode = 1;
		}
	},
};
