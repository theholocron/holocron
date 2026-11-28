import type { CommandModule } from "yargs";

import { loadConfig } from "../../config/index.js";
import { applyResolvedConfig } from "../apply-resolved-config/index.js";
import type { GlobalArgs } from "../global-args/index.js";
import { resolveOrg } from "../resolve-org/index.js";
import { tokenContext } from "../token-context/index.js";
import { runSyncTooling } from "./run-sync-tooling/index.js";

export const syncToolingCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "tooling",
	describe: "Sync each tooling provider (collections, environments, specs) without running the rest of setup",
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const report = await runSyncTooling({
			loaded,
			context: { repoRoot: argv.cwd, dryRun: argv.dryRun, ...tokens, org: resolveOrg(argv, loaded.resolved) },
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
