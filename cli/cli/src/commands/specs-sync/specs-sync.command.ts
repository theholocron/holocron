import type { CommandModule } from "yargs";

import { loadConfig } from "../../config/index.js";
import { applyResolvedConfig } from "../apply-resolved-config/index.js";
import { type GlobalArgs } from "../global-args/index.js";
import { resolveOrg } from "../resolve-org/index.js";
import { tokenContext } from "../token-context/index.js";
import { realSpecsSyncIo, runSpecsSync } from "./index.js";
import { type SpecsSyncArgs, specsSyncArgs } from "./specs-sync.args.js";

export const specsSyncCommand: CommandModule<GlobalArgs, SpecsSyncArgs> = {
	command: "specs",
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
			...(argv.provider ? { provider: argv.provider } : {}),
			...(argv.channel ? { channel: argv.channel } : {}),
			...(argv.files ? { files: argv.files } : {}),
			...(argv.pr !== undefined ? { pr: argv.pr } : {}),
			refreshOrigin: argv.refreshOrigin,
			refreshTitles: argv.refreshTitles,
			refresh: argv.refresh,
			withdraw: argv.withdraw,
			notify: argv.notify,
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
