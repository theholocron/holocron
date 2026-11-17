import type { Argv, CommandModule } from "yargs";

import { loadConfig } from "../../config/index.js";
import { applyResolvedConfig } from "../apply-resolved-config/index.js";
import type { GlobalArgs } from "../global-args/index.js";
import { resolveOrg } from "../resolve-org/index.js";
import { tokenContext } from "../token-context/index.js";
import { runSyncRequests } from "./run-sync-requests/index.js";

type Args = GlobalArgs & { to?: string; check?: boolean; prefer?: "source" | "workspace"; yes?: boolean };

export const syncRequestsCommand: CommandModule<GlobalArgs, Args> = {
	command: "requests",
	describe: "Keep each tooling provider's workspace and the repo's request files in step, both ways",
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
			.option("prefer", {
				type: "string",
				choices: ["source", "workspace"] as const,
				describe:
					"Settle a pair whose request file and workspace both changed since the last sync: `source` regenerates the workspace from the request files, `workspace` the request files from the workspace",
			})
			.option("yes", {
				type: "boolean",
				describe: "Write without asking (required without a terminal)",
			}),
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
			...(argv.prefer ? { prefer: argv.prefer } : {}),
			...(argv.yes ? { yes: true } : {}),
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
