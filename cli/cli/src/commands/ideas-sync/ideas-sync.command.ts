import type { Argv, CommandModule } from "yargs";

import { loadConfig } from "../../config/index.js";
import { applyResolvedConfig } from "../apply-resolved-config/index.js";
import type { GlobalArgs } from "../global-args/index.js";
import { resolveOrg } from "../resolve-org/index.js";
import { tokenContext } from "../token-context/index.js";
import { runIdeasSync } from "./run-ideas-sync/index.js";

type Args = GlobalArgs & { yes?: boolean };

export const ideasSyncCommand: CommandModule<GlobalArgs, Args> = {
	command: "ideas",
	describe: "File the idea notes that are ready as issues, and record the issue in each note",
	builder: (y: Argv<GlobalArgs>) =>
		y.option("yes", {
			type: "boolean",
			describe: "File without asking (required without a terminal)",
		}) as never,
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const report = await runIdeasSync({
			loaded,
			context: { repoRoot: argv.cwd, dryRun: argv.dryRun, ...tokens, org: resolveOrg(argv, loaded.resolved) },
			...(argv.yes ? { yes: true } : {}),
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
