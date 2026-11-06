import type { CommandModule } from "yargs";

import { loadConfig } from "../../config/index.js";
import { applyResolvedConfig } from "../apply-resolved-config/index.js";
import type { GlobalArgs } from "../global-args/index.js";
import { runDoctorCi } from "./doctor-ci.js";

export const doctorCiCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "ci",
	describe:
		"Check the repo against the flat task vocabulary: aliases, caller names, the ci aggregate, home (read-only)",
	handler: async (argv) => {
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const report = await runDoctorCi({ loaded, context: { repoRoot: argv.cwd } });
		if (report.status === "fail") process.exitCode = 1;
	},
};
