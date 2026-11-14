import type { Argv, CommandModule } from "yargs";

import { loadConfig } from "../../config/index.js";
import { applyResolvedConfig } from "../apply-resolved-config/index.js";
import type { GlobalArgs } from "../global-args/index.js";
import { resolveOrg } from "../resolve-org/index.js";
import { tokenContext } from "../token-context/index.js";
import { runRequestsExport } from "./run-requests-export/index.js";

type Args = GlobalArgs & { to?: string; out?: string; yes?: boolean };

export const requestsExportCommand: CommandModule<GlobalArgs, Args> = {
	command: "requests",
	describe: "Write the request collections in each tooling provider's own format, never into the source folder",
	builder: (y: Argv<GlobalArgs>) =>
		y
			.option("to", {
				type: "string",
				describe: "Export only for this tooling provider (default: every one that can export)",
			})
			.option("out", {
				type: "string",
				describe:
					"The folder to write under, one folder per provider (default: `.export` next to the collection files, which is git-ignored)",
			})
			.option("yes", {
				type: "boolean",
				describe: "Write without asking (required without a terminal)",
			}) as never,
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const report = await runRequestsExport({
			loaded,
			context: { repoRoot: argv.cwd, dryRun: argv.dryRun, ...tokens, org: resolveOrg(argv, loaded.resolved) },
			...(argv.to ? { to: argv.to } : {}),
			...(argv.out ? { out: argv.out } : {}),
			...(argv.yes ? { yes: true } : {}),
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
