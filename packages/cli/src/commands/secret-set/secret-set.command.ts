import type { CommandModule } from "yargs";

import { applyResolvedConfig, parseScope, resolveOrg, tokenContext } from "../../cli-support/index.js";
import { type GlobalArgs } from "../../cli-support/index.js";
import { loadConfig } from "../../config/index.js";
import { getEntry } from "../../interactive-menu/index.js";
import { promptForPositionals } from "../../ui/index.js";
import { runSecretSet } from "./index.js";
import { type SecretSetArgs, secretSetArgs } from "./secret-set.args.js";

export const secretSetCommand: CommandModule<GlobalArgs, SecretSetArgs> = {
	command: "set [name] [value]",
	describe: "Set a single secret via the configured `secrets` capability",
	builder: secretSetArgs,
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const [name] = await promptForPositionals(getEntry("secrets set"), argv as Record<string, unknown>);
		const scopeArg = argv.scope as string;
		const scope = parseScope(scopeArg);
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const report = await runSecretSet({
			loaded,
			context: {
				repoRoot: argv.cwd,
				dryRun: argv.dryRun,
				...tokens,
				org: resolveOrg(argv, loaded.resolved),
			},
			name: name!,
			...(argv.value ? { value: argv.value as string } : {}),
			...(argv.fromStdin ? { fromStdin: true } : {}),
			...(argv.fromEnv ? { fromEnv: argv.fromEnv as string } : {}),
			scope,
		});
		if (report.status === "fail") {
			process.exitCode = 1;
		}
	},
};
