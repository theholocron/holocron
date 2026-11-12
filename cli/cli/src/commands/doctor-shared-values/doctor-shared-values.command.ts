import type { Argv, CommandModule } from "yargs";

import { loadConfig } from "../../config/index.js";
import { applyResolvedConfig } from "../apply-resolved-config/index.js";
import { type GlobalArgs } from "../global-args/index.js";
import { resolveOrg } from "../resolve-org/index.js";
import { tokenContext } from "../token-context/index.js";
import { runDoctorSharedValues } from "./doctor-shared-values.js";

interface DoctorSharedValuesArgs extends GlobalArgs {
	strict?: boolean;
	allow?: string[];
}

const doctorSharedValuesArgs = (y: Argv<GlobalArgs>): Argv<DoctorSharedValuesArgs> =>
	y
		.option("strict", {
			type: "boolean",
			default: false,
			describe: "Fail (exit 1) when a secret holds the same value in two layers, instead of reporting it as info",
		})
		.option("allow", {
			type: "string",
			array: true,
			describe:
				"A name shared on purpose; repeat for more. `doctor.sharedVariables` in the config lists them too",
		});

export const doctorSharedValuesCommand: CommandModule<GlobalArgs, DoctorSharedValuesArgs> = {
	command: "shared-values",
	describe: "Find secrets that hold the same value in two layers: local, dev, ci and prod (read-only, names only)",
	builder: doctorSharedValuesArgs,
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const report = await runDoctorSharedValues({
			loaded,
			context: { repoRoot: argv.cwd, ...tokens, org: resolveOrg(argv, loaded.resolved) },
			strict: argv.strict === true,
			allow: argv.allow ?? [],
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
