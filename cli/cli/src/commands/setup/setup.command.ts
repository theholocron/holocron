import type { CommandModule } from "yargs";

import { loadConfig } from "../../config/index.js";
import { applyResolvedConfig } from "../apply-resolved-config/index.js";
import { type GlobalArgs } from "../global-args/index.js";
import { resolveOrg } from "../resolve-org/index.js";
import { tokenContext } from "../token-context/index.js";
import { runSetup } from "./index.js";
import { type SetupArgs, setupArgs } from "./setup.args.js";

export const setupCommand: CommandModule<GlobalArgs, SetupArgs> = {
	command: "setup",
	describe: "Apply infra setup actions across every configured capability",
	builder: setupArgs,
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const report = await runSetup({
			loaded,
			context: {
				repoRoot: argv.cwd,
				dryRun: argv.dryRun,
				...(argv.repo ? { repo: argv.repo } : {}),
				...tokens,
				org: resolveOrg(argv, loaded.resolved),
			},
			...(argv.hooks !== undefined ? { hooks: argv.hooks as boolean } : {}),
		});
		if (report.summary.fail > 0) {
			process.exitCode = 1;
		}
	},
};
