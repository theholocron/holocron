import type { CommandModule } from "yargs";

import { loadConfig } from "../../config/index.js";
import { applyResolvedConfig } from "../apply-resolved-config/index.js";
import { runDoctorAll } from "../doctor-all/index.js";
import { type GlobalArgs } from "../global-args/index.js";
import { resolveOrg } from "../resolve-org/index.js";
import { tokenContext } from "../token-context/index.js";
import { type DoctorArgs, doctorArgs } from "./doctor.args.js";
import { runDoctor } from "./doctor.js";

export const doctorCommand: CommandModule<GlobalArgs, DoctorArgs> = {
	command: "doctor",
	describe: "Load the config and run a smoke check against every provider",
	builder: doctorArgs,
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		if (argv.all) {
			const all = await runDoctorAll({
				loaded,
				context: {
					repoRoot: argv.cwd,
					...(argv.repo ? { repo: argv.repo } : {}),
					...tokens,
					org: resolveOrg(argv, loaded.resolved),
				},
			});
			if (all.status === "fail") process.exitCode = 1;
			return;
		}
		const report = await runDoctor({
			loaded,
			context: {
				repoRoot: argv.cwd,
				dryRun: argv.dryRun,
				...(argv.repo ? { repo: argv.repo } : {}),
				...tokens,
				org: resolveOrg(argv, loaded.resolved),
			},
		});
		if (report.summary.fail > 0) {
			process.exitCode = 1;
		}
	},
};
