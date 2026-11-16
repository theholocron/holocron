import type { Argv, CommandModule } from "yargs";

import { loadConfig } from "../../config/index.js";
import { applyResolvedConfig } from "../apply-resolved-config/index.js";
import type { GlobalArgs } from "../global-args/index.js";
import { resolveOrg } from "../resolve-org/index.js";
import { tokenContext } from "../token-context/index.js";
import { runUploadCoverage } from "./run-upload-coverage/index.js";

type Args = GlobalArgs & { uploads: string; allowEmpty?: boolean };

export const uploadCoverageCommand: CommandModule<GlobalArgs, Args> = {
	command: "coverage",
	describe: "Upload the repo's coverage reports, one flag per group, through the coverage provider",
	builder: (y: Argv<GlobalArgs>) =>
		y
			.option("uploads", {
				type: "string",
				demandOption: true,
				describe:
					'JSON list of {"flag": "utils", "files": "utils/*/coverage/lcov.info"} (a glob from the repo root)',
			})
			.option("allow-empty", {
				type: "boolean",
				describe:
					"Let a run with no coverage file in any group finish quietly (an affected run that selected nothing)",
			}) as never,
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const report = await runUploadCoverage({
			loaded,
			context: { repoRoot: argv.cwd, dryRun: argv.dryRun, ...tokens, org: resolveOrg(argv, loaded.resolved) },
			uploads: argv.uploads,
			...(argv.allowEmpty ? { allowEmpty: true } : {}),
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
