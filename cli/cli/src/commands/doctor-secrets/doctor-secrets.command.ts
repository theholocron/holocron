import type { CommandModule } from "yargs";

import { loadConfig } from "../../config/index.js";
import { applyResolvedConfig } from "../apply-resolved-config/index.js";
import { type GlobalArgs } from "../global-args/index.js";
import { resolveOrg } from "../resolve-org/index.js";
import { tokenContext } from "../token-context/index.js";
import { runDoctorSecrets } from "./doctor-secrets.js";
import { parseEnvList } from "./parse-env-list.js";

type Args = GlobalArgs & {
	env?: string[];
	onlySecrets?: boolean;
	onlyVariables?: boolean;
	strict?: boolean;
	verify?: boolean;
	name?: string;
};

export const doctorSecretsCommand: CommandModule<GlobalArgs, Args> = {
	command: "secrets",
	describe:
		"Check the secrets the config says must exist against the ones the provider holds (read-only, names only)",
	builder: (y) =>
		y
			.option("env", {
				type: "string",
				array: true,
				describe:
					"Environments to check: local, dev, ci, test, prod; comma-separated or repeated. Default: every environment the config declares",
			})
			.option("only-secrets", {
				type: "boolean",
				conflicts: "only-variables",
				describe: "Show only the secrets block",
			})
			.option("only-variables", {
				type: "boolean",
				conflicts: "only-secrets",
				describe: "Show only the variables block",
			})
			.option("verify", {
				type: "boolean",
				default: false,
				describe: "Also ask each vendor whether the tokens the plugins take are still accepted (goes online)",
			})
			.option("strict", {
				type: "boolean",
				default: false,
				describe: "Fail (exit 1) when a place holds a name nothing feeds, instead of reporting it as info",
			})
			.option("name", {
				type: "string",
				describe: "Print how each place stands for this one name, and why. Informational: exit 0",
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
			...(argv.onlySecrets
				? { only: "secrets" as const }
				: argv.onlyVariables
					? { only: "variables" as const }
					: {}),
			strict: argv.strict === true,
			...(argv.verify ? { verify: true } : {}),
			...(argv.name ? { name: argv.name } : {}),
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
