import type { CommandModule } from "yargs";

import { loadConfig } from "../../../config/index.js";
import { applyResolvedConfig } from "../../apply-resolved-config/index.js";
import { type GlobalArgs } from "../../global-args/index.js";
import { resolveOrg } from "../../resolve-org/index.js";
import { tokenContext } from "../../token-context/index.js";
import { runProjectReconcile } from "./index.js";
import { type ProjectReconcileArgs, projectReconcileArgs } from "./reconcile.args.js";

export const projectReconcileCommand: CommandModule<GlobalArgs, ProjectReconcileArgs> = {
	command: "reconcile [board]",
	describe: "Set item statuses where a rule says so: blocked, unblocked, closed (status only)",
	builder: projectReconcileArgs,
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const report = await runProjectReconcile({
			loaded,
			context: {
				repoRoot: argv.cwd,
				dryRun: argv.dryRun,
				...tokens,
				org: resolveOrg(argv, loaded.resolved),
			},
			...(argv.board ? { board: argv.board as string } : {}),
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
