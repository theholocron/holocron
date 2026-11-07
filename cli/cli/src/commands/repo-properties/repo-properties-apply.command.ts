import type { Argv, CommandModule } from "yargs";

import { loadConfig } from "../../config/index.js";
import { applyResolvedConfig } from "../apply-resolved-config/index.js";
import { type GlobalArgs } from "../global-args/index.js";
import { resolveOrg } from "../resolve-org/index.js";
import { tokenContext } from "../token-context/index.js";
import { runPropertiesApply } from "./run-properties-apply/index.js";

export const repoPropertiesApplyCommand: CommandModule<GlobalArgs, GlobalArgs & { yes?: boolean }> = {
	command: "apply",
	describe: "Add the capabilities the organization's holocron_capabilities property does not allow yet",
	builder: (y: Argv<GlobalArgs>) => y.option("yes", { type: "boolean", describe: "Add without asking" }) as never,
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const report = await runPropertiesApply({
			loaded,
			context: { repoRoot: argv.cwd, dryRun: argv.dryRun, ...tokens, org: resolveOrg(argv, loaded.resolved) },
			...(argv.yes ? { yes: true } : {}),
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
