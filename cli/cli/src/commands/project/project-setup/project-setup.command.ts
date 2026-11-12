import type { CommandModule } from "yargs";

import { loadConfig } from "../../../config/index.js";
import { applyResolvedConfig } from "../../apply-resolved-config/index.js";
import { type GlobalArgs } from "../../global-args/index.js";
import { resolveOrg } from "../../resolve-org/index.js";
import { tokenContext } from "../../token-context/index.js";
import { runProjectSetup } from "./project-setup.js";

export const projectSetupCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "project",
	describe: "Make each board providers.projects declares match its template, creating the ones that are missing",
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const report = await runProjectSetup({
			loaded,
			context: { repoRoot: argv.cwd, dryRun: argv.dryRun, ...tokens, org: resolveOrg(argv, loaded.resolved) },
			owner: argv.org,
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
