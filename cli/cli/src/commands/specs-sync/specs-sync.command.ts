import type { CommandModule } from "yargs";

import { applyResolvedConfig, resolveOrg, tokenContext } from "../../cli-support/index.js";
import { type GlobalArgs } from "../../cli-support/index.js";
import { loadConfig } from "../../config/index.js";
import { realSpecsSyncIo, runSpecsSync } from "./index.js";
import { type SpecsSyncArgs, specsSyncArgs } from "./specs-sync.args.js";

export const specsSyncCommand: CommandModule<GlobalArgs, SpecsSyncArgs> = {
	command: "sync",
	describe: "Keep each ADR and spec in step with a post in a forum channel",
	builder: specsSyncArgs,
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const report = await runSpecsSync({
			loaded,
			context: {
				repoRoot: argv.cwd,
				dryRun: argv.dryRun,
				...tokens,
				org: resolveOrg(argv, loaded.resolved),
			},
			io: realSpecsSyncIo(argv.cwd),
			...(argv.provider ? { provider: argv.provider as string } : {}),
			...(argv.channel ? { channel: argv.channel as string } : {}),
			notify: argv.notify as boolean,
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
