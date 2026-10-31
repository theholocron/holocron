import type { CommandModule } from "yargs";

import { applyResolvedConfig, type GlobalArgs, resolveOrg, tokenContext } from "../../cli-support/index.js";
import { loadConfig } from "../../config/index.js";
import { runDoctorSecrets } from "./doctor-secrets.js";

export const doctorSecretsCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "secrets",
	describe:
		"Check the secrets the config says must exist against the ones the provider holds (read-only, names only)",
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const report = await runDoctorSecrets({
			loaded,
			context: { repoRoot: argv.cwd, ...tokens, org: resolveOrg(argv, loaded.resolved) },
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
