import type { CommandModule } from "yargs";

import { loadConfig } from "../../../config/index.js";
import { applyResolvedConfig } from "../../apply-resolved-config/index.js";
import { type GlobalArgs } from "../../global-args/index.js";
import { resolveOrg } from "../../resolve-org/index.js";
import { tokenContext } from "../../token-context/index.js";
import { runProjectList } from "./project-list.js";

export const projectListCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "list",
	describe: "List the boards of the organization, with their number, name and state",
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const org = resolveOrg(argv, loaded.resolved);
		const report = await runProjectList({
			loaded,
			context: { repoRoot: argv.cwd, dryRun: argv.dryRun, ...tokens, org },
			owner: argv.org,
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
