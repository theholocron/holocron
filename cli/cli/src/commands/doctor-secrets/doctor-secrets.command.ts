import type { CommandModule } from "yargs";

import { loadConfig } from "../../config/index.js";
import { applyResolvedConfig } from "../apply-resolved-config/index.js";
import { type GlobalArgs } from "../global-args/index.js";
import { resolveOrg } from "../resolve-org/index.js";
import { tokenContext } from "../token-context/index.js";
import { runDoctorSecrets } from "./doctor-secrets.js";
import { parseEnvList } from "./parse-env-list.js";

type Args = GlobalArgs & { env?: string[] };

export const doctorSecretsCommand: CommandModule<GlobalArgs, Args> = {
	command: "secrets",
	describe:
		"Check the secrets the config says must exist against the ones the provider holds (read-only, names only)",
	builder: (y) =>
		y.option("env", {
			type: "string",
			array: true,
			describe:
				"Environments to check: local, dev, ci, test, prod; comma-separated or repeated. Default: every environment the config declares",
		}) as never,
	handler: async (argv) => {
		const environments = parseEnvList(argv.env);
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const report = await runDoctorSecrets({
			loaded,
			context: { repoRoot: argv.cwd, ...tokens, org: resolveOrg(argv, loaded.resolved) },
			...(environments ? { environments } : {}),
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
