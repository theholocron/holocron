import type { Argv, CommandModule } from "yargs";

import { loadConfig } from "../../config/index.js";
import { applyResolvedConfig } from "../apply-resolved-config/index.js";
import type { GlobalArgs } from "../global-args/index.js";
import { resolveOrg } from "../resolve-org/index.js";
import { tokenContext } from "../token-context/index.js";
import { runReconcileCi } from "./run-reconcile-ci/index.js";

type Args = GlobalArgs & { "pull-request"?: number; "max-age"?: number; shadow?: boolean };

export const reconcileCiCommand: CommandModule<GlobalArgs, Args> = {
	command: "ci [pull-request]",
	describe:
		"Make the ci / Required checks check say what the checks on each open pull request call for (the manual path and the sweep)",
	builder: (y: Argv<GlobalArgs>) =>
		y
			.positional("pull-request", {
				type: "number",
				describe: "Reconcile only this pull request (default: every open one)",
			})
			.option("shadow", {
				type: "boolean",
				describe:
					"Repair Sentinel's shadow check (ci / Required checks (sentinel)) instead of the real one; the only way to post while ci.aggregate is actions",
			})
			.option("max-age", {
				type: "number",
				describe:
					"Minutes a missing or unfinished aggregate may wait before it counts as a missed delivery and fails the run (default 10)",
			}),
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const report = await runReconcileCi({
			loaded,
			context: { repoRoot: argv.cwd, dryRun: argv.dryRun, ...tokens, org: resolveOrg(argv, loaded.resolved) },
			...(argv["pull-request"] !== undefined ? { pullRequest: Number(argv["pull-request"]) } : {}),
			...(argv["max-age"] !== undefined ? { maxAgeMinutes: Number(argv["max-age"]) } : {}),
			...(argv.shadow ? { shadow: true } : {}),
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
