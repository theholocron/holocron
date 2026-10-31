import type { CommandModule } from "yargs";

import { applyResolvedConfig, type GlobalArgs, resolveOrg, tokenContext } from "../../cli-support/index.js";
import { loadConfig } from "../../config/index.js";
import { runCleanupBranches } from "./index.js";
import { type RepoCleanupBranchesArgs, repoCleanupBranchesArgs } from "./repo-cleanup-branches.args.js";

export const repoCleanupBranchesCommand: CommandModule<GlobalArgs, RepoCleanupBranchesArgs> = {
	command: "branches",
	describe: "List the branches whose pull request is merged and delete the ones you pick (local, remote or both)",
	builder: repoCleanupBranchesArgs,
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const report = await runCleanupBranches({
			loaded,
			context: {
				repoRoot: argv.cwd,
				dryRun: argv.dryRun,
				...tokens,
				org: resolveOrg(argv, loaded.resolved),
			},
			scope: argv.local && !argv.remote ? "local" : argv.remote && !argv.local ? "remote" : "both",
			...(argv.yes ? { yes: true } : {}),
			...(argv.repo ? { repo: argv.repo } : {}),
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
