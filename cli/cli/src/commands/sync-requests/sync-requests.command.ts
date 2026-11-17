import type { Argv, CommandModule } from "yargs";

import { loadConfig } from "../../config/index.js";
import { applyResolvedConfig } from "../apply-resolved-config/index.js";
import type { GlobalArgs } from "../global-args/index.js";
import { resolveOrg } from "../resolve-org/index.js";
import { tokenContext } from "../token-context/index.js";
import { runSyncRequests } from "./run-sync-requests/index.js";

type Args = GlobalArgs & { to?: string; check?: boolean; yes?: boolean };

export const syncRequestsCommand: CommandModule<GlobalArgs, Args> = {
	command: "requests",
	describe: "Keep each tooling provider's workspace of the repo's request collections equal to the request files",
	builder: (y: Argv<GlobalArgs>) =>
		y
			.option("to", {
				type: "string",
				describe: "Sync only for this tooling provider (default: every one with a workspace)",
			})
			.option("check", {
				type: "boolean",
				describe: "Write nothing and exit non-zero when any file is out of date (for CI)",
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
		const report = await runSyncRequests({
			loaded,
			context: { repoRoot: argv.cwd, dryRun: argv.dryRun, ...tokens, org: resolveOrg(argv, loaded.resolved) },
			...(argv.to ? { to: argv.to } : {}),
			...(argv.check ? { check: true } : {}),
			...(argv.yes ? { yes: true } : {}),
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
